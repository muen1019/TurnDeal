import {ImprovementRepository} from '../dist/src/improver/repository.js';
import {BuyerRequestImprover} from '../dist/src/improver/service.js';
import {configuredProvider,deterministicProvider,OpenAIRevisionProvider} from '../dist/src/improver/provider.js';
import {formatIntent} from '../../src/formatter/parser.ts';
import {ensureImprovementChild} from './improver-followup.mjs';
import {assertContract} from '../../src/orchestrator/contract.ts';
import {HttpError} from '../src/httpError.ts';
import {effectivePreferenceText,preferenceDocument} from '../dist/src/improver/preferences.js';

/** Build backend first. Live mode uses only the server-side API_KEY configuration. */
export function createRuntimeImprover(store,{mode='offline',provider}={}) {
  let sequence=0;
  const repository=new ImprovementRepository({
    rows:(sql,args=[])=>store.db.prepare(sql).all(...args),
    run:(sql,args=[])=>{store.db.prepare(sql).run(...args);},
    transaction:work=>{
      const name=`improver_${++sequence}`;
      store.db.exec(`SAVEPOINT ${name}`);
      try{const result=work();store.db.exec(`RELEASE ${name}`);return result;}
      catch(error){store.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);throw error;}
    },
    snapshot:(id,buyer)=>store.snapshot(id,buyer),
    ensureBuyer:buyer=>store.ensureBuyer(buyer),
    now:()=>new Date(store.now()),
  });
  const normalize=(documents,saved=[],weights)=>{
    const result=formatIntent({intent_md:documents.intent_md,preference_md:effectivePreferenceText(preferenceDocument(documents.preference_md,0))},saved);
    if(result.status!=='ready'||!result.normalized_intent)throw new Error('formatter_unsupported');
    return {...result.normalized_intent,...(weights?{ranking_weights:weights}:{})};
  };
  const liveProvider=store.apiKey?{kind:'llm',generate:(context,errors,signal)=>new OpenAIRevisionProvider(store.apiKey,store.modelFor(context.parent_request_id)).generate(context,errors,signal)}:null;
  const selected=provider===undefined?(mode==='live'?(liveProvider??configuredProvider()):deterministicProvider):provider;
  return new BuyerRequestImprover(repository,selected,30000,normalize);
}

/** Durable queue: scheduling errors never undo a saved selection; recovery retries bounded jobs. */
export function installImprover(app,store,buyerId,options={}){
  const improver=createRuntimeImprover(store,options),running=new Map();
  let closing=false;
  const advance=job=>{
    try{
      const child=ensureImprovementChild(store,job);
      if(child&&options.autoProcess!==false)void store.process(child,job.context.buyer_id);
    }catch{
      store.db.prepare("UPDATE improver_workflows SET error='child_creation_failed' WHERE current_improvement_id=? AND next_request_id IS NULL").run(job.improvement_id);
    }
  };
  const schedule=(buyer,id)=>{
    if(closing||running.has(id))return;
    const work=Promise.resolve().then(()=>improver.run(buyer,id)).then(advance).catch(()=>{/* lease recovery owns retries */}).finally(()=>running.delete(id));
    running.set(id,work);
  };
  const recover=()=>{
    if(closing)return;
    for(const row of store.db.prepare("SELECT improvement_id,buyer_id FROM improver_jobs WHERE status='queued' OR (status='running' AND lease_until<=?)").all(store.now()))schedule(row.buyer_id,row.improvement_id);
    for(const row of store.db.prepare("SELECT w.buyer_id,w.current_improvement_id,w.next_request_id FROM improver_workflows w JOIN improver_jobs j ON j.improvement_id=w.current_improvement_id WHERE j.status='ready'").all()){
      if(!row.next_request_id)schedule(row.buyer_id,row.current_improvement_id);
      else if(options.autoProcess!==false&&store.snapshot(row.next_request_id,row.buyer_id).status==='formatting')void store.process(row.next_request_id,row.buyer_id);
    }
  };
  const timer=setInterval(recover,5000);timer.unref();
  setImmediate(recover);
  const close=store.close.bind(store);
  store.close=async()=>{closing=true;clearInterval(timer);await Promise.allSettled(running.values());await close();};
  app.get('/api/requests/:request_id/improvement',(req,res,next)=>{try{
    const buyer=buyerId(req),id=req.params.request_id;
    const snapshot=store.snapshot(id,buyer);
    const workflow=store.db.prepare('SELECT * FROM improver_workflows WHERE parent_request_id=? AND buyer_id=?').get(id,buyer);
    const row=workflow?{improvement_id:workflow.current_improvement_id}:store.db.prepare('SELECT improvement_id FROM improver_jobs WHERE parent_request_id=? AND buyer_id=? AND source_improvement_id IS NULL').get(id,buyer);
    if(!row){res.json(null);return;}
    const job=improver.repository.get(buyer,row.improvement_id);
    const r=job.result;
    res.json({improvement_id:job.improvement_id,request_id:id,mode:snapshot.status==='accepted'?'accepted_with_rejections':'all_rejected',status:job.status,
      next_request_id:workflow?.next_request_id??null,workflow_error:workflow?.error??null,workflow_enabled:!!workflow,
      can_clarify:!!workflow&&!workflow.next_request_id&&job.status==='needs_clarification',
      result:r?{intent_revision_id:r.intent_revision_id,intent_state:r.intent_state,documents:r.documents,preference_updated:r.preference_updated,questions:r.questions}:null,error:job.error});
  }catch(error){next(error);}});
  app.post('/api/requests/:request_id/improvement/clarifications',(req,res,next)=>{try{
    const buyer=buyerId(req),id=req.params.request_id,body=req.body;
    store.snapshot(id,buyer);
    try{assertContract('ImprovementClarification',body);}catch{throw new HttpError(400,'invalid_request','請完整說明本次需要調整的條件，最多 2000 字。');}
    if(/sk-[A-Za-z0-9_-]{20,}/.test(body.feedback))throw new HttpError(400,'credential_detected','請勿輸入 API key。');
    const source=improver.repository.get(buyer,body.improvement_id);
    if(source.context.parent_request_id!==id)throw new HttpError(404,'not_found','找不到這個改善工作。');
    const result=store.idempotent(buyer,'POST',req.path,req.header('Idempotency-Key'),body,()=>{
      const job=improver.repository.enqueueClarification(buyer,body.improvement_id,body.feedback);
      return {status:202,body:{request_id:id,improvement_id:job.improvement_id,status:'queued'}};
    });
    res.status(result.status).json(result.body);schedule(buyer,result.body.improvement_id);
  }catch(error){
    if(error?.message==='improvement_not_found')error=new HttpError(404,'not_found','找不到這個改善工作。');
    if(error?.message==='clarification_state_conflict')error=new HttpError(409,'state_conflict','改善狀態已更新，請重新讀取。');
    next(error);
  }});
  app.locals.improver=improver;
  return {improver,schedule,enableWorkflow:(buyer,parent,job)=>store.db.prepare('INSERT INTO improver_workflows(parent_request_id,buyer_id,initial_improvement_id,current_improvement_id,created_at) VALUES(?,?,?,?,?)').run(parent,buyer,job.improvement_id,job.improvement_id,new Date(store.now()).toISOString())};
}
