import {RuntimeStore} from './store.mjs';
import {createRuntimeImprover} from './improver.mjs';

// Synthetic in-memory full runtime; only Improver uses a model when --live is explicit.
const live=process.argv.includes('--live');
const store=new RuntimeStore({now:()=>Date.parse('2026-09-12T02:00:00Z')});
try{
  const buyer='demo_runtime_improver';store.ensureBuyer(buyer);
  const {body}=store.idempotent(buyer,'POST','/api/requests','demo-improver',{},()=>store.create(buyer,{intent_md:'無線靜音滑鼠，預算 1000 元，7天內到貨。',preference_md:''}));
  await store.process(body.request_id,buyer);
  const before=store.snapshot(body.request_id,buyer);
  if(before.status!=='awaiting_user')throw new Error('Synthetic runtime did not reach awaiting_user');
  store.idempotent(buyer,'POST',`/api/requests/${body.request_id}/decisions`,'reject',{},()=>store.decide(buyer,body.request_id,{action:'reject',feedback:'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。'}));
  const improver=createRuntimeImprover(store,{mode:live?'live':'offline'});
  const job=improver.repository.enqueueRejectedRequest(buyer,body.request_id);
  const done=await improver.run(buyer,job.improvement_id);
  console.log(JSON.stringify({mode:live?'live':'offline',negotiation:'offline',ranked_offer_count:before.ranked_offers.length,
    status:done.status,attempts:done.attempts,result:done.result},null,2));
  if(done.status!=='ready'||!done.result?.preference_updated||done.result?.provider!==(live?'llm':'deterministic'))process.exitCode=1;
}finally{await store.close();}
