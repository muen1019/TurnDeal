import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeStore} from '../backend/runtime/store.mjs';
import {createRuntimeImprover} from '../backend/runtime/improver.mjs';

test('real runtime request, negotiation and saved rejection feed the durable Improver',async()=>{
  const store=new RuntimeStore({now:()=>Date.parse('2026-09-12T02:00:00Z')});
  try{
    const buyer='improver_runtime_test';store.ensureBuyer(buyer);
    const {body}=store.idempotent(buyer,'POST','/api/requests','runtime-improver',{},()=>store.create(buyer,{intent_md:'無線靜音滑鼠，預算 1000 元，7天內到貨。',preference_md:''}));
    await store.process(body.request_id,buyer);
    assert.equal(store.snapshot(body.request_id,buyer).status,'awaiting_user');
    const decision=store.idempotent(buyer,'POST',`/api/requests/${body.request_id}/decisions`,'reject',{},()=>store.decide(buyer,body.request_id,{action:'reject',feedback:'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。'}));
    const improver=createRuntimeImprover(store);
    const job=improver.repository.enqueueRejectedRequest(buyer,body.request_id);
    const done=await improver.run(buyer,job.improvement_id);
    assert.equal(done.result.status,'ready');
    assert.equal(done.result.preference_updated,true);
    assert.equal(done.result.provider,'deterministic');
    assert.match(done.result.documents.intent_md,/800/);
    assert.deepEqual(store.snapshot(body.request_id,buyer).decision,decision.body);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM improver_intent_revisions').get().n,1);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM improver_global_preferences').get().n,1);
    assert.equal((await improver.run(buyer,job.improvement_id)).result.intent_revision_id,done.result.intent_revision_id);
  }finally{await store.close();}
});
