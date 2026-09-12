import express from 'express';
import { RuntimeStore } from './store.mjs';
import { assertContract } from '../../src/orchestrator/contract.ts';
import { HttpError } from '../src/httpError.ts';

export function createRuntimeApp({buyerId=()=> 'demo_buyer',autoProcess=true,...options}={}) {
  const store=new RuntimeStore(options),app=express();app.locals.store=store;
  app.use(express.json({limit:'256kb',strict:true}));
  app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const validate=(name,body)=>{
    // Reject accidental credential pastes before any DB/idempotency write.
    if(/sk-[A-Za-z0-9_-]{20,}/.test(JSON.stringify(body)))throw new HttpError(400,'credential_detected','請勿在購物需求或回饋輸入 API key。');
    try{assertContract(name,body);}catch{throw new HttpError(400,'invalid_request','輸入格式不符合共用契約。');}
    return body;
  };
  app.post('/api/requests',(req,res,next)=>{try{
    const body=validate('CreateRequest',req.body),buyer=buyerId(req);
    const result=store.idempotent(buyer,'POST','/api/requests',req.header('Idempotency-Key'),body,
      ()=>store.create(buyer,{intent_md:body.intent_md,preference_md:body.preference_md??''},body.clarification,body.refinement));
    res.status(result.status).json(result.body);
    if(result.scheduleRequestId&&autoProcess)setImmediate(()=>{void store.process(result.scheduleRequestId,buyer);});
  }catch(e){next(e);}});
  app.get('/api/buyer-profile',(req,res,next)=>{try{res.json({profile:store.buyerProfile(buyerId(req))});}catch(e){next(e);}});
  app.post('/api/buyer-profile',(req,res,next)=>{try{
    const body=validate('BuyerProfile',req.body),buyer=buyerId(req);
    if(/(?:\d[ -]?){13,19}/.test(body.name+' '+body.shipping_address))throw new HttpError(400,'sensitive_payment_data','請勿輸入卡號或金融帳號；本頁只設定付款方式。');
    const result=store.idempotent(buyer,'POST','/api/buyer-profile',req.header('Idempotency-Key'),body,()=>store.saveBuyerProfile(buyer,body));
    res.status(result.status).json(result.body);
  }catch(e){next(e);}});
  app.get('/api/requests/:request_id',(req,res,next)=>{try{res.json(store.snapshot(req.params.request_id,buyerId(req)));}catch(e){next(e);}});
  app.post('/api/requests/:request_id/decisions',(req,res,next)=>{try{
    const body=validate(req.body?.action==='accept'?'AcceptDecision':'RejectDecision',req.body),buyer=buyerId(req),id=req.params.request_id;
    store.snapshot(id,buyer);
    const result=store.idempotent(buyer,'POST',`/api/requests/${id}/decisions`,req.header('Idempotency-Key'),body,()=>store.decide(buyer,id,body));
    res.status(result.status).json(result.body);
  }catch(e){next(e);}});
  app.use((_req,_res,next)=>next(new HttpError(404,'not_found','找不到這個資源。')));
  app.use((error,_req,res,_next)=>{
    if(error instanceof SyntaxError||error?.type==='entity.too.large')error=new HttpError(400,'invalid_request','JSON 格式錯誤或內容過長。');
    if(error instanceof HttpError)res.status(error.status).json(error.body());
    else res.status(500).json({error:{code:'internal_error',message:'後端處理失敗，請用原 key 核對提交結果。',fields:[]}});
  });
  return app;
}
