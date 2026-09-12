import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { createOrchestratorHandoff, toDiscoveryQuery } from '../src/orchestrator/handoff.ts';
import type { SellerRFQ, SellerHandler, SellerRegistration } from '../src/orchestrator/handoff.ts';
import { rankCandidates } from '../src/orchestrator/discovery.ts';
import type { NormalizedIntent } from '../src/orchestrator/data-tools.ts';
import { assertContract } from '../src/orchestrator/contract.ts';
const now = () => new Date('2026-09-12T02:00:00Z');
const args = { request_id:'req_demo_001',snapshot_id:'discovery_demo_v02',idempotency_key:'first' };
function setup() {
  const db = new DatabaseSync(':memory:'); initializeDatabase(db);
  const catalog = seedDiscovery(db);
  const calls: SellerRFQ[] = [];
  const handle: SellerHandler = async rfq => {
    calls.push(structuredClone(rfq));
    return {request_id:rfq.request_id,seller_id:rfq.seller_id,round:rfq.round,outcome:'refused',is_final:false,drafts:[],message:'test stub only'};
  };
  const registrations = catalog.sellers.map(s=>({seller_id:s.seller_id,snapshot_id:catalog.snapshot_id,handle}));
  const create = (r:SellerRegistration[]=registrations, userId='user_demo_001',timeoutMs=100) => createOrchestratorHandoff({db,userId,registrations:r,timeoutMs,now});
  return {db,catalog,calls,registrations,create};
}
test('request snapshot -> preferences -> ranking -> private RFQ -> registered functions, replay-safe', async () => {
  const {db,calls,create} = setup();
  try {
    const service=create(); const plan=service.prepare(args);
    assert.equal(plan.rfqs.length,5);
    assertContract('OrchestrationResult',plan.orchestration);
    for (const rfq of plan.rfqs) {
      assertContract('SellerRFQ',rfq);
      const serialized=JSON.stringify(rfq);
      for(const key of ['max_total_twd','source_text','campaign','trust','intent_md','floor']) assert.ok(!serialized.includes(key));
      assert.equal(rfq.target_total_twd,null);
      assert.ok(plan.product_bindings.some(b=>b.seller_id===rfq.seller_id && b.product_id===rfq.candidate_product_ids[0]));
      assert.ok(rfq.product_preferences.length>0);
    }
    assert.deepEqual(service.prepare(args),plan);
    assert.equal(db.prepare('SELECT count(*) n FROM discovery_runs').get()?.n,1);
    assert.throws(()=>service.prepare({...args,target_total_twd:800}),/idempotency_conflict/);
    const results=await service.dispatch_first_round({handoff_id:plan.handoff_id});
    assert.equal(calls.length,5); assert.ok(results.every(r=>r.outcome==='refused'));
    assert.deepEqual(await service.dispatch_first_round({handoff_id:plan.handoff_id}),results);
    assert.equal(calls.length,5);
    assert.throws(()=>db.exec("UPDATE orchestrator_handoffs SET plan_json='{}'"),/immutable/);
    assert.throws(()=>create([], 'other_user').prepare(args),/not found/i);
    await assert.rejects(create([], 'other_user').dispatch_first_round({handoff_id:plan.handoff_id}),/not_found/);
    assert.equal(db.prepare('SELECT count(*) n FROM offers').get()?.n,6); // No fake formal offers.
  } finally {db.close();}
});
test('full preferences preserve not_in, multi-value, required ranges and private max vs optional target', () => {
  const {db,catalog}=setup();
  try {
    const intent=JSON.parse(String(db.prepare('SELECT normalized_intent_json FROM requests').get()?.normalized_intent_json)) as NormalizedIntent;
    intent.product_preferences=[{preference_id:'color',strength:'required',attribute:'color',operator:'not_in',values:['black'],source_text:'private'},
      {preference_id:'soft',strength:'preferred',attribute:'color',operator:'in',values:['white','rose'],source_text:'private'}];
    const q=toDiscoveryQuery(intent);
    assert.equal(q.target_total_twd,undefined); assert.equal(q.max_total_twd,intent.max_total_twd);
    const normal=rankCandidates(catalog,{...q,target_total_twd:800,priorities:[]},now().toISOString());
    const delivery=rankCandidates(catalog,{...q,target_total_twd:800,priorities:['delivery_first']},now().toISOString());
    assert.ok(delivery.weights.delivery>normal.weights.delivery);
    assert.ok(rankCandidates(catalog,{...q,priorities:['price_first']},now().toISOString()).weights.price>0);
    const ranked=rankCandidates(catalog,q,now().toISOString());
    assert.ok(ranked.candidates.filter(c=>c.candidate_status==='qualified').every(c=>c.listing.attributes.color!=='black'));
    intent.product_preferences=[{preference_id:'range',strength:'required',attribute:'length_mm',operator:'range',min:90,max:120,source_text:'private'}];
    assert.ok(rankCandidates(catalog,toDiscoveryQuery(intent),now().toISOString()).candidates.every(c=>!c.negotiation_ready && c.candidate_status==='alternative_requires_confirmation'));
    intent.product_preferences[0].min=200;
    assert.throws(()=>toDiscoveryQuery(intent),/range/);
  } finally {db.close();}
});
test('missing or wrong-snapshot handlers never dispatch, and hard-limit alternatives stay display-only', async () => {
  const {db,create,registrations,calls}=setup();
  try {
    const service=create(registrations.map(r=>({...r,snapshot_id:'wrong'})));
    const plan=service.prepare(args);
    assert.equal(plan.rfqs.length,0); assert.equal(plan.status,'no_dispatchable_sellers');
    assert.deepEqual(await service.dispatch_first_round({handoff_id:plan.handoff_id}),[]);
    assert.equal(calls.length,0);
    const original = db.prepare('SELECT * FROM requests WHERE request_id=?').get('req_demo_001')!;
    const hardIntent=JSON.parse(String(original.normalized_intent_json)); hardIntent.max_total_twd=1;
    const hardRow={...original,request_id:'req_hard',normalized_intent_json:JSON.stringify(hardIntent),published_snapshot_json:null,status:'orchestrating'};
    const keys=Object.keys(hardRow);
    db.prepare(`INSERT INTO requests (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(hardRow));
    const hardService=create();
    const hardPlan=hardService.prepare({...args,request_id:'req_hard'});
    assert.equal(hardPlan.discovery.candidates.length,5);
    assert.ok(hardPlan.discovery.candidates.every(c=>c.candidate_status==='alternative_requires_confirmation'));
    assert.equal(hardPlan.rfqs.length,0);
    assert.deepEqual(await hardService.dispatch_first_round({handoff_id:hardPlan.handoff_id}),[]);
  } finally {db.close();}
});
test('timeout, malformed response, isolation and concurrent dispatch protection', async () => {
  const {db,create,registrations}=setup();
  try {
    let count=0;
    const handler:SellerHandler=async (rfq,{signal})=>{
      count++;
      if(count===1) return await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
      return {request_id:'wrong',seller_id:rfq.seller_id,round:1,outcome:'refused',is_final:false,drafts:[],message:'bad id'};
    };
    const service=create(registrations.map(r=>({...r,handle:handler})), 'user_demo_001',20);
    const plan=service.prepare(args);
    const pending=service.dispatch_first_round({handoff_id:plan.handoff_id});
    await assert.rejects(service.dispatch_first_round({handoff_id:plan.handoff_id}),/in_progress/);
    const results=await pending;
    assert.equal(count,5);
    assert.equal(results.filter(r=>r.outcome==='timeout').length,1);
    assert.equal(results.filter(r=>r.outcome==='error').length,4);
  } finally {db.close();}
});
