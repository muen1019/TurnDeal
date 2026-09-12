import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {assertContract} from '../src/orchestrator/contract.ts';
import {deterministicProposal} from '../backend/dist/src/improver/guard.js';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const buyer='selection_test';
test('versioned selection examples satisfy the shared input contract',()=>{
  const examples=JSON.parse(readFileSync(new URL('../contracts/fixtures/selection-improver.v1.json',import.meta.url),'utf8'));
  for(const example of Object.values(examples))assertContract(example.action==='accept'?'AcceptDecision':'RejectDecision',example);
});
async function fixture(options={}){
  const app=createRuntimeApp({autoProcess:false,buyerId:req=>req.headers['x-buyer']??buyer,now:()=>Date.parse('2026-09-12T02:00:00Z'),...options});
  const store=app.locals.store;
  const create=await request(app).post('/api/requests').set('Idempotency-Key','create').send({intent_md:'無線靜音滑鼠，預算 1000 元，7天內到貨。',preference_md:''}).expect(202);
  const id=create.body.request_id;await store.process(id,buyer);
  const s=store.snapshot(id,buyer);assert.equal(s.status,'awaiting_user');
  return {app,store,id,s,ids:s.ranked_offers.map(o=>o.offer_id),
    post:(body,key='decision')=>request(app).post(`/api/requests/${id}/decisions`).set('Idempotency-Key',key).send(body),
    get:()=>request(app).get(`/api/requests/${id}/improvement`)};
}
async function completed(f){
  for(let i=0;i<100;i++){
    const {body}=await f.get().expect(200);assertContract('ImprovementStatus',body);
    if(body&&!['queued','running'].includes(body.status))return body;
    await new Promise(r=>setTimeout(r,10));
  }
  throw new Error('improvement did not finish');
}

test('accept with earlier left swipes queues once, preserves purchased offer and original documents',async()=>{
  const f=await fixture();try{
    const body={action:'accept',offer_id:f.ids[1],selection_version:1,rejected_offer_ids:[f.ids[0]]};
    const accepted=(await f.post(body).expect(200)).body;
    assert.deepEqual((await f.post(body).expect(200)).body,accepted);
    const done=await completed(f);assert.equal(done.mode,'accepted_with_rejections');
    assert.equal(done.status,'needs_clarification');assert.equal(done.result.preference_updated,false);
    const s=f.store.snapshot(f.id,buyer);assert.equal(s.status,'accepted');assert.equal(s.selected_offer_id,f.ids[1]);assert.deepEqual(s.documents,f.s.documents);
    assert.equal(s.next_request_id,null);assert.equal(f.store.db.prepare('SELECT count(*) n FROM requests WHERE user_id=?').get(buyer).n,1);
    const jobs=f.store.db.prepare('SELECT context_json FROM improver_jobs').all();assert.equal(jobs.length,1);
    const context=JSON.parse(jobs[0].context_json);assert.deepEqual(context.rejected_offers.map(o=>o.offer_id),[f.ids[0]]);
    assert.equal(context.evidence.some(e=>e.kind==='user_feedback'),false);
    await request(f.app).get(`/api/requests/${f.id}/improvement`).set('x-buyer','other').expect(404);
    await f.post({action:'reject',selection_version:1,rejected_offer_ids:f.ids,feedback:''},'late-reject').expect(409);
  }finally{await f.store.close();}
});

test('final left swipe without feedback queues a draft; partial/invented/duplicate sets do not commit',async()=>{
  const f=await fixture();try{
    assert.equal((await f.get().expect(200)).body,null);
    await f.post({action:'reject',feedback:''},'missing').expect(400);
    for(const [key,ids,status] of [['partial',[f.ids[0]],409],['foreign',[...f.ids.slice(1),'foreign'],409],['duplicate',[...f.ids,f.ids[0]],400]])
      await f.post({action:'reject',selection_version:1,rejected_offer_ids:ids,feedback:''},key).expect(status);
    assert.equal(f.store.snapshot(f.id,buyer).status,'awaiting_user');
    const body={action:'reject',selection_version:1,rejected_offer_ids:f.ids,feedback:''};
    const rejected=(await f.post(body).expect(200)).body;assert.equal(rejected.feedback,'');
    assert.deepEqual((await f.post(body).expect(200)).body,rejected);
    const done=await completed(f);assert.equal(done.mode,'all_rejected');assert.equal(done.status,'needs_clarification');
    assert.equal(done.result.intent_state,'draft');assert.ok(done.result.questions.length);assert.equal(done.result.preference_updated,false);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM improver_jobs').get().n,1);
    assert.deepEqual(f.store.snapshot(f.id,buyer).documents,f.s.documents);
  }finally{await f.store.close();}
});

test('explicit long-term feedback after all rejections updates preference and ready intent',async()=>{
  const f=await fixture();try{
    await f.post({action:'reject',selection_version:1,rejected_offer_ids:f.ids,feedback:'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。'}).expect(200);
    const done=await completed(f);assert.equal(done.status,'ready');assert.equal(done.result.preference_updated,true);assert.match(done.result.documents.intent_md,/800/);
  }finally{await f.store.close();}
});

test('first right swipe has no job; selecting a rejected ID is invalid',async()=>{
  const f=await fixture();try{
    await f.post({action:'accept',offer_id:f.ids[0],selection_version:1,rejected_offer_ids:[f.ids[0]]},'invalid').expect(409);
    await f.post({action:'accept',offer_id:f.ids[0],selection_version:1,rejected_offer_ids:[]}).expect(200);
    assert.equal((await f.get().expect(200)).body,null);
  }finally{await f.store.close();}
});

test('queue write failure rolls back selection and its idempotency key',async()=>{
  const f=await fixture();try{
    f.store.db.exec("CREATE TRIGGER reject_job BEFORE INSERT ON improver_jobs BEGIN SELECT RAISE(ABORT,'test'); END");
    const body={action:'reject',selection_version:1,rejected_offer_ids:f.ids,feedback:''};
    await f.post(body).expect(500);
    assert.equal(f.store.snapshot(f.id,buyer).status,'awaiting_user');
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM decisions WHERE request_id=?').get(f.id).n,0);
    f.store.db.exec('DROP TRIGGER reject_job');
    await f.post(body).expect(200);await completed(f);
  }finally{await f.store.close();}
});

test('expired all-rejected set is not committed',async()=>{
  let now=Date.parse('2026-09-12T02:00:00Z');const f=await fixture({now:()=>now});try{
    now+=3600000;
    await f.post({action:'reject',selection_version:1,rejected_offer_ids:f.ids,feedback:''}).expect(410);
    assert.equal((await f.get().expect(200)).body,null);
  }finally{await f.store.close();}
});

test('purchase can start while accepted-selection improvement is still running',async()=>{
  let release;
  const provider={kind:'llm',generate:context=>new Promise(resolve=>{release=()=>resolve(deterministicProposal(context));})};
  const f=await fixture({improverOptions:{provider}});
  try{
    await f.post({action:'accept',offer_id:f.ids[1],selection_version:1,rejected_offer_ids:[f.ids[0]],feedback:'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。'}).expect(200);
    assert.equal((await f.get()).body.status,'running');
    const purchase=await request(f.app).post(`/api/requests/${f.id}/purchases`).set('Idempotency-Key','purchase').send({}).expect(201);
    assert.equal(purchase.body.offer.offer_id,f.ids[1]);
    assert.equal((await f.get()).body.status,'running');
    release();const done=await completed(f);
    assert.equal(done.status,'ready');assert.equal(done.result.preference_updated,true);
    assert.deepEqual(f.store.snapshot(f.id,buyer).documents,f.s.documents);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM requests WHERE user_id=?').get(buyer).n,1);
  }finally{release?.();await f.store.close();}
});
