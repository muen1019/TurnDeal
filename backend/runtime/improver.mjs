import {ImprovementRepository} from '../dist/src/improver/repository.js';
import {BuyerRequestImprover} from '../dist/src/improver/service.js';
import {configuredProvider,deterministicProvider} from '../dist/src/improver/provider.js';
import {formatIntent} from '../../src/formatter/parser.ts';

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
  const normalize=documents=>{
    const result=formatIntent({intent_md:documents.intent_md,preference_md:documents.preference_md});
    if(result.status!=='ready'||!result.normalized_intent)throw new Error('formatter_unsupported');
    return result.normalized_intent;
  };
  const selected=provider===undefined?(mode==='live'?configuredProvider():deterministicProvider):provider;
  return new BuyerRequestImprover(repository,selected,30000,normalize);
}

/** Durable queue: scheduling errors never undo a saved selection; recovery retries bounded jobs. */
export function installImprover(app,store,buyerId,options={}){
  const improver=createRuntimeImprover(store,options),running=new Map();
  let closing=false;
  const schedule=(buyer,id)=>{
    if(closing||running.has(id))return;
    const work=Promise.resolve().then(()=>improver.run(buyer,id)).catch(()=>{/* lease recovery owns retries */}).finally(()=>running.delete(id));
    running.set(id,work);
  };
  const recover=()=>{
    if(closing)return;
    for(const row of store.db.prepare("SELECT improvement_id,buyer_id FROM improver_jobs WHERE status='queued' OR (status='running' AND lease_until<=?)").all(store.now()))schedule(row.buyer_id,row.improvement_id);
  };
  const timer=setInterval(recover,5000);timer.unref();
  setImmediate(recover);
  const close=store.close.bind(store);
  store.close=async()=>{closing=true;clearInterval(timer);await Promise.allSettled(running.values());await close();};
  app.get('/api/requests/:request_id/improvement',(req,res,next)=>{try{
    const buyer=buyerId(req),id=req.params.request_id;
    const snapshot=store.snapshot(id,buyer);
    const row=store.db.prepare('SELECT improvement_id FROM improver_jobs WHERE parent_request_id=? AND buyer_id=?').get(id,buyer);
    if(!row){res.json(null);return;}
    const job=improver.repository.get(buyer,row.improvement_id);
    const r=job.result;
    res.json({improvement_id:job.improvement_id,request_id:id,mode:snapshot.status==='accepted'?'accepted_with_rejections':'all_rejected',status:job.status,
      result:r?{intent_revision_id:r.intent_revision_id,intent_state:r.intent_state,documents:r.documents,preference_updated:r.preference_updated,questions:r.questions}:null,error:job.error});
  }catch(error){next(error);}});
  app.locals.improver=improver;
  return {improver,schedule};
}
