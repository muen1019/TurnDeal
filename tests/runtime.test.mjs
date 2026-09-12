import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntimeApp } from '../backend/runtime/app.mjs';
import { assertContract } from '../src/orchestrator/contract.ts';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const input={intent_md:'辦公用無線滑鼠。\n\n## 本次購買需求\n滑鼠800元左右，預算1000元含稅運，7天內到貨。',preference_md:'價格優先，可接受免費滑鼠墊，不接受付費加購。'};
const configured={autoProcess:false,apiKey:'',buyerId:req=>req.headers['x-test-buyer']??'demo_buyer'};
async function start(app,key='create',body=input){return (await request(app).post('/api/requests').set('Idempotency-Key',key).send(body).expect(202)).body;}

test('HTTP -> existing Formatter request -> Discovery -> five sellers -> Evaluator -> immutable accept/replay',async()=>{
  const app=createRuntimeApp(configured),store=app.locals.store;
  try {
    const initial=await start(app),id=initial.request_id;assert.equal(initial.status,'formatting');
    await Promise.all([store.process(id,'demo_buyer'),store.process(id,'demo_buyer')]);
    const s=(await request(app).get(`/api/requests/${id}`).expect(200)).body;
    assert.equal(s.status,'awaiting_user',JSON.stringify(s.error));assertContract('RequestSnapshot',s);
    assert.equal(s.seller_agents.length,5);assert.ok(s.ranked_offers.length>=5);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM formatter_runs WHERE request_id=?').get(id).n,1);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM evaluation_runs WHERE request_id=?').get(id).n,1);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM negotiation_runs WHERE request_id=?').get(id).n,1);
    assert.ok(store.db.prepare('SELECT count(*) AS n FROM negotiation_commits WHERE request_id=?').get(id).n>1);
    const json=JSON.stringify(s);for(const field of ['floor_price_twd','audit_json','buyer_provider','instructions','traces'])assert.ok(!json.includes(field),field);
    const frozen=store.db.prepare('SELECT published_snapshot_json FROM requests WHERE request_id=?').get(id).published_snapshot_json;
    const stock=store.db.prepare('SELECT * FROM seller_inventory').all();
    const payload={action:'accept',offer_id:s.ranked_offers[0].offer_id};
    const accepted=(await request(app).post(`/api/requests/${id}/decisions`).set('Idempotency-Key','accept').send(payload).expect(200)).body;
    const replay=(await request(app).post(`/api/requests/${id}/decisions`).set('Idempotency-Key','accept').send(payload).expect(200)).body;
    assert.deepEqual(replay,accepted);assert.equal(accepted.selected_offer_id,payload.offer_id);
    assert.equal((await request(app).get(`/api/requests/${id}`).expect(200)).body.status,'accepted');
    assert.equal(store.db.prepare('SELECT published_snapshot_json FROM requests WHERE request_id=?').get(id).published_snapshot_json,frozen);
    assert.deepEqual(store.db.prepare('SELECT * FROM seller_inventory').all(),stock);
    assert.deepEqual((await start(app)).request_id,id);
    await request(app).post('/api/requests').set('Idempotency-Key','create').send({...input,intent_md:'changed'}).expect(409);
    await request(app).get(`/api/requests/${id}`).set('x-test-buyer','other').expect(404);
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {await store.close();}
});

test('unclear and impossible requests never negotiate; credentials never persist',async()=>{
  const app=createRuntimeApp(configured),store=app.locals.store;
  try {
    const unclear=await start(app,'unclear',{intent_md:'想買滑鼠'});await store.process(unclear.request_id,'demo_buyer');
    assert.equal(store.snapshot(unclear.request_id,'demo_buyer').status,'needs_clarification');
    const empty=await start(app,'empty',{intent_md:'買滑鼠，預算10元，1天內到貨'});await store.process(empty.request_id,'demo_buyer');
    assert.equal(store.snapshot(empty.request_id,'demo_buyer').status,'no_match');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM negotiation_runs').get().n,0);
    const rejected=(await request(app).post(`/api/requests/${empty.request_id}/decisions`).set('Idempotency-Key','reject').send({action:'reject',feedback:'  保留原文  '}).expect(200)).body;
    assert.equal(rejected.feedback,'  保留原文  ');assert.equal(rejected.source_documents.intent_md,'買滑鼠，預算10元，1天內到貨');
    const fake='sk-'+'x'.repeat(35);await request(app).post('/api/requests').set('Idempotency-Key','secret').send({intent_md:fake}).expect(400);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM idempotency_keys WHERE idempotency_key='secret'").get().n,0);
  } finally {await store.close();}
});

test('LLM Formatter transport feeds the same HTTP request; repeated POST does not pay again',async()=>{
  let calls=0;
  const extraction={category:'mouse',max_total_twd:1000,target_total_twd:null,delivery_days_max:7,
    budget_evidence:'最高1000元',target_evidence:'',delivery_evidence:'7天內到貨',required_features:['wireless'],preferences:[],
    product_preferences:[],bundle_mode:'related_no_extra_cost',questions:[],unsupported_conditions:[]};
  const formatterOptions={fetch:async(url,options)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(extraction)}]}]});
  }};
  const noNetwork=async()=>{throw new Error('intentional offline negotiation/evaluation transport');};
  const app=createRuntimeApp({...configured,apiKey:'test-key-not-a-credential',formatterOptions,
    negotiationOptions:{fetchImpl:noNetwork},evaluatorOptions:{fetchImpl:noNetwork}}),store=app.locals.store;
  try {
    const body={intent_md:'買滑鼠，最高1000元，7天內到貨'};
    const first=await start(app,'llm',body);await store.process(first.request_id,'demo_buyer');
    assert.equal(store.snapshot(first.request_id,'demo_buyer').status,'awaiting_user');
    const stored=JSON.parse(store.db.prepare('SELECT result_json FROM formatter_runs WHERE request_id=?').get(first.request_id).result_json);
    assert.equal(stored.parser_version,'formatter-llm-v0.1');
    assert.equal((await start(app,'llm',body)).request_id,first.request_id);await store.process(first.request_id,'demo_buyer');
    assert.equal(calls,1);
  } finally {await store.close();}
});

test('acceptance rechecks inventory and expiry; restart restores decisions and fails interrupted work',async()=>{
  const dbPath=join(mkdtempSync(join(tmpdir(),'offermesh-runtime-')),'app.sqlite');let time=Date.now();
  let app=createRuntimeApp({...configured,dbPath,now:()=>time}),store=app.locals.store;
  try {
    const initial=await start(app);await store.process(initial.request_id,'demo_buyer');
    const s=store.snapshot(initial.request_id,'demo_buyer');assert.equal(s.status,'awaiting_user');
    const o=s.offers.find(o=>o.offer_id===s.ranked_offers[0].offer_id);
    store.db.prepare('UPDATE seller_inventory SET stock=0 WHERE seller_id=?').run(o.seller_id);
    await request(app).post(`/api/requests/${s.request_id}/decisions`).set('Idempotency-Key','no-stock').send({action:'accept',offer_id:o.offer_id}).expect(409);
    time=Date.parse(o.expires_at)+1;
    await request(app).post(`/api/requests/${s.request_id}/decisions`).set('Idempotency-Key','expired').send({action:'accept',offer_id:o.offer_id}).expect(410);
    const body={action:'reject',feedback:'晚點再買'};
    const original=(await request(app).post(`/api/requests/${s.request_id}/decisions`).set('Idempotency-Key','reject').send(body).expect(200)).body;
    const interrupted=await start(app,'interrupted');await store.close();
    app=createRuntimeApp({...configured,dbPath,now:()=>time});store=app.locals.store;
    assert.equal(store.snapshot(interrupted.request_id,'demo_buyer').status,'failed');
    assert.deepEqual((await request(app).post(`/api/requests/${s.request_id}/decisions`).set('Idempotency-Key','reject').send(body).expect(200)).body,original);
    assert.equal(store.snapshot(s.request_id,'demo_buyer').status,'rejected');
  } finally {await store.close();}
});
