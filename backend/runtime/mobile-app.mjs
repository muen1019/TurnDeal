import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {createRuntimeApp} from './app.mjs';
import {HttpError} from '../src/httpError.ts';
import express from 'express';

// Ephemeral demo only: no live credentials, no persistent personal database.
export function createMobileApp({mode='offline',apiKey='',pairingCode='',runtimeOptions={}}={}){
 if(!['offline','live'].includes(mode))throw new Error('Invalid mobile mode');
 const live=mode==='live';
 if(live&&(!apiKey||!/^\w{12,64}$/.test(pairingCode)))throw new Error('Live mobile mode requires a backend key and pairing code');
 const secret=randomBytes(32),cache=Symbol('mobileBuyer');
 const cookieName=live?'turndeal_live':'turndeal_demo';
 const sign=id=>createHmac('sha256',secret).update(id).digest('hex');
 const existing=req=>{
  const token=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const [id,signature]=token?.split('.')??[];
  return id&&/^[a-f0-9-]{36}$/.test(id)&&signature&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(sign(id)))?id:null;
 };
 const issue=req=>{
  const id=randomUUID();
  req.res.setHeader('Set-Cookie',`${cookieName}=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Strict`);
  return id;
 };
 const buyerId=req=>{
  if(req[cache])return req[cache];
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)
   throw new HttpError(403,'origin_mismatch','請從同一個 Demo 網址操作。');
  let buyer=existing(req);
  if(!buyer&&live)throw new HttpError(401,'mobile_pairing_required','請輸入電腦終端顯示的手機配對碼。');
  if(!buyer)buyer=issue(req);
  return req[cache]='mobile_'+buyer;
 };
 const runtime=createRuntimeApp({...runtimeOptions,dbPath:':memory:',apiKey:live?apiKey:'',buyerId,improverOptions:{mode},purchaseOptions:{mode:'test'}});
 if(!live)return runtime;
 const app=express();app.locals.store=runtime.locals.store;
 let attempts=0,windowStart=Date.now();
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 app.get('/api/mobile-session',(req,res)=>res.json({connected:!!existing(req),mode:'live'}));
 app.post('/api/mobile-session',express.json({limit:'1kb'}),(req,res)=>{
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return res.status(403).json({error:'origin_mismatch'});
  if(Date.now()-windowStart>60000){attempts=0;windowStart=Date.now();}
  if(++attempts>10)return res.status(429).json({error:'請稍候一分鐘再配對。'});
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if(Object.keys(req.body??{}).length!==1||code.length!==pairingCode.length||!timingSafeEqual(Buffer.from(code),Buffer.from(pairingCode)))
   return res.status(401).json({error:'配對碼不正確，請查看電腦終端。'});
  if(!existing(req))issue(req);
  res.json({connected:true,mode:'live'});
 });
 app.use('/api',(req,res,next)=>{if(!existing(req))return res.status(401).json({error:{code:'mobile_pairing_required',message:'請先配對手機。',fields:[]}});next();});
 app.use(runtime);
 app.use((_error,_req,res,_next)=>res.status(400).json({error:'配對資料格式不正確。'}));
 return app;
}
