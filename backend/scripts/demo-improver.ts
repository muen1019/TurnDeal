import {OfferStore} from '../src/store.js';
import {ImprovementRepository} from '../src/improver/repository.js';
import {BuyerRequestImprover} from '../src/improver/service.js';
import {configuredProvider,deterministicProvider,loadImproverEnvironment} from '../src/improver/provider.js';

// Synthetic fixture only. This does not submit the user's documents to a provider.
const live=process.argv.includes('--live');
const configured=live?configuredProvider():deterministicProvider;
const provider=configured&&process.argv.includes('--inspect')?{kind:configured.kind,async generate(...args:Parameters<typeof configured.generate>){const value=await configured.generate(...args);console.log(JSON.stringify({synthetic_proposal:value}));return value;}}:configured;
if(live&&!provider)throw new Error('API_KEY is missing; live validation did not run.');
const store=await OfferStore.open({dbPath:':memory:',now:()=>new Date('2026-09-12T02:00:00Z')});
try{
  const buyer='demo_improver';
  const repository=new ImprovementRepository(store.improvementStorage());
  for(const [name,feedback] of [
    ['purchase_only','這次預算改成 800 元'],
    ['explicit_long_term','這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。'],
  ]){
    const created=await store.withIdempotency(buyer,'POST','/api/requests',name,{},()=>store.createRequest(buyer,{intent_md:'無線靜音滑鼠，預算 1000 元，7 天內到貨。',preference_md:''}));
    const id=(created.body as {request_id:string}).request_id;store.processRequest(id);
    await store.withIdempotency(buyer,'POST',`/api/requests/${id}/decisions`,name,{feedback},()=>store.rejectDecision(buyer,id,feedback));
    const job=repository.enqueueRejectedRequest(buyer,id);
    const finished=await new BuyerRequestImprover(repository,provider).run(buyer,job.improvement_id);
    const result=finished.result;
    console.log(JSON.stringify({scenario:name,mode:live?'live':'deterministic',model:live?loadImproverEnvironment().model:null,attempts:finished.attempts,
      status:result?.status,provider:result?.provider,preference_updated:result?.preference_updated,intent_md:result?.documents.intent_md,preference_md:result?.documents.preference_md,audit:result?.audit}));
    if(result?.status!=='ready'||result.provider!==(live?'llm':'deterministic')||result.preference_updated!==(name==='explicit_long_term'))process.exitCode=1;
  }
}finally{store.close();}
