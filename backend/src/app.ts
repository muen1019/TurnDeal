import express,{type ErrorRequestHandler,type Request} from 'express';
import {resolve} from 'node:path';
import {backendRoot} from './paths.js';
import {HttpError,invalidRequest,notFound} from './httpError.js';
import {assertValid} from './schema.js';
import {OfferStore} from './store.js';
import type {AcceptDecision,CreateRequest,RejectDecision} from './types.js';
export type CreateAppOptions={dbPath?:string;now?:()=>Date;autoProcess?:boolean;buyerId?:(request:Request)=>string;afterIdempotencyReserved?:(scope:{method:string;path:string;key:string})=>Promise<void>|void;beforeCommit?:()=>void};
export async function createApp(options:CreateAppOptions={}){
 const store=await OfferStore.open({...options,dbPath:options.dbPath??resolve(backendRoot,'data/result-v02.sqlite'),now:options.now??(()=>new Date())});
 const app=express();app.locals.store=store;app.use(express.json({limit:'256kb',strict:true}));
 const buyer=(req:Request)=>options.buyerId?.(req)??'demo_buyer';
 function key(req:Request){const value=req.header('Idempotency-Key');if(!value||[...value].length>128)throw invalidRequest('POST requires Idempotency-Key (1–128 characters).',['Idempotency-Key']);return value;}
 app.post('/api/requests',async(req,res,next)=>{try{const body=assertValid<CreateRequest>('CreateRequest',req.body);const result=await store.withIdempotency(buyer(req),'POST','/api/requests',key(req),body,()=>store.createRequest(buyer(req),{intent_md:body.intent_md,preference_md:body.preference_md??''}));res.status(result.status).json(result.body);if(result.scheduleRequestId&&options.autoProcess!==false)setImmediate(()=>{try{store.processRequest(result.scheduleRequestId!);}catch(error){console.error('Mock publication failed',error);}});}catch(error){next(error);}});
 app.get('/api/requests/:request_id',(req,res,next)=>{try{res.json(store.snapshot(req.params.request_id,buyer(req)));}catch(error){next(error);}});
 app.post('/api/requests/:request_id/decisions',async(req,res,next)=>{try{
  const body=req.body?.action==='accept'?assertValid<AcceptDecision>('AcceptDecision',req.body):assertValid<RejectDecision>('RejectDecision',req.body);const id=req.params.request_id;store.snapshot(id,buyer(req));
  const result=await store.withIdempotency(buyer(req),'POST',`/api/requests/${id}/decisions`,key(req),body,()=>body.action==='accept'?store.acceptDecision(buyer(req),id,body.offer_id):store.rejectDecision(buyer(req),id,body.feedback));res.status(result.status).json(result.body);
 }catch(error){next(error);}});
 app.use((_req,_res,next)=>next(notFound()));
 app.use(((error,_req,res,_next)=>{if(error instanceof SyntaxError||error?.type==='entity.too.large')error=invalidRequest('Invalid JSON or oversized request body.',['body']);if(error instanceof HttpError){for(const[k,v]of Object.entries(error.headers))res.setHeader(k,v);res.status(error.status).json(error.body());}else res.status(500).json({error:{code:'internal_error',message:'Unexpected backend error; reconcile the original request.',fields:[]}});}) satisfies ErrorRequestHandler);
 return app;
}
