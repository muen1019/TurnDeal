import express from 'express';
import { RuntimeStore } from './store.mjs';
import { assertContract } from '../../src/orchestrator/contract.ts';
import { HttpError } from '../src/httpError.ts';
import { installPurchases } from './purchase/service.mjs';
import { installImprover } from './improver.mjs';

export function createRuntimeApp({buyerId=()=> 'demo_buyer',autoProcess=true,purchaseOptions={},improverOptions={},...options}={}) {
  if(purchaseOptions.mode&&purchaseOptions.mode!=='test')throw new HttpError(503,'live_checkout_not_configured','正式購買尚未配置');
  const store=new RuntimeStore(options),app=express();app.locals.store=store;
  app.use(express.json({limit:'256kb',strict:true,verify(req,_res,buf){req.rawBody=buf.toString();}}));
  app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const validate=(name,body)=>{
    // Reject accidental credential pastes before any DB/idempotency write.
    if(/sk-[A-Za-z0-9_-]{20,}/.test(JSON.stringify(body)))throw new HttpError(400,'credential_detected','請勿在購物需求或回饋輸入 API key。');
    try{assertContract(name,body);}catch{throw new HttpError(400,'invalid_request','輸入格式不符合共用契約。');}
    return body;
  };
  app.get('/api/preferences',(req,res,next)=>{try{
    const buyer=buyerId(req);res.json(store.preferences.current(buyer));
  }catch(error){next(error);}});
  app.post('/api/preferences',(req,res,next)=>{try{
    const body=validate('UpdateUserPreference',req.body),buyer=buyerId(req);
    const result=store.idempotent(buyer,'POST','/api/preferences',req.header('Idempotency-Key'),body,()=>({
      status:200,body:store.preferences.save(buyer,body.markdown,body.base_revision),
    }));res.status(result.status).json(result.body);
  }catch(error){next(error);}});
  app.post('/api/requests',(req,res,next)=>{try{
    const body=validate('CreateRequest',req.body),buyer=buyerId(req);
    const result=store.idempotent(buyer,'POST','/api/requests',req.header('Idempotency-Key'),body,
      ()=>store.create(buyer,{intent_md:body.intent_md,preference_md:body.preference_md??''},body.clarification,body.refinement,body.model));
    res.status(result.status).json(result.body);
    if(result.scheduleRequestId&&autoProcess)setImmediate(()=>{void store.process(result.scheduleRequestId,buyer);});
  }catch(e){next(e);}});
  app.get('/api/buyer-profile',(req,res,next)=>{try{res.json({profile:store.buyerProfile(buyerId(req))});}catch(e){next(e);}});
  app.post('/api/buyer-profile',(req,res,next)=>{try{
    const body=validate('BuyerProfile',req.body),buyer=buyerId(req);
    if([body.name,body.shipping_address,...Object.values(body.shipping_details??{})].some(value=>/(?:\d[ -]?){13,19}/.test(value)))throw new HttpError(400,'sensitive_payment_data','請勿輸入卡號或金融帳號；本頁只設定付款方式。');
    const result=store.idempotent(buyer,'POST','/api/buyer-profile',req.header('Idempotency-Key'),body,()=>store.saveBuyerProfile(buyer,body));
    res.status(result.status).json(result.body);
  }catch(e){next(e);}});
  app.get('/api/requests/:request_id',(req,res,next)=>{try{res.json(store.snapshot(req.params.request_id,buyerId(req)));}catch(e){next(e);}});
  const improvement=installImprover(app,store,buyerId,{...improverOptions,autoProcess});
  app.post('/api/requests/:request_id/decisions',(req,res,next)=>{try{
    const body=validate(req.body?.action==='accept'?'AcceptDecision':'RejectDecision',req.body),buyer=buyerId(req),id=req.params.request_id;
    store.snapshot(id,buyer);
    const result=store.idempotent(buyer,'POST',`/api/requests/${id}/decisions`,req.header('Idempotency-Key'),body,()=>{
      const decision=store.decide(buyer,id,body);
      if(body.selection_version===1&&body.rejected_offer_ids.length){
        const job=improvement.improver.repository.enqueueSelection(buyer,id);
        if(body.action==='reject')improvement.enableWorkflow(buyer,id,job);
      }
      return decision;
    });
    res.status(result.status).json(result.body);
    const job=store.db.prepare('SELECT improvement_id FROM improver_jobs WHERE parent_request_id=? AND buyer_id=? AND source_improvement_id IS NULL').get(id,buyer);
    if(job)improvement.schedule(buyer,job.improvement_id);
  }catch(e){next(e);}});
  installPurchases(app,store,buyerId,purchaseOptions);
  app.use((_req,_res,next)=>next(new HttpError(404,'not_found','找不到這個資源。')));
  app.use((error,_req,res,_next)=>{
    if(error?.message==='preference_version_conflict'||error?.message==='preference_update_required')
      error=new HttpError(409,error.message,'偏好已有版本，請先讀取並確認使用者偏好，再以版本號儲存。',['preference_md']);
    if(error instanceof SyntaxError||error?.type==='entity.too.large')error=new HttpError(400,'invalid_request','JSON 格式錯誤或內容過長。');
    if(error instanceof HttpError)res.status(error.status).json(error.body());
    else res.status(500).json({error:{code:'internal_error',message:'後端處理失敗，請用原 key 核對提交結果。',fields:[]}});
  });
  return app;
}
