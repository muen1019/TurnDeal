import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {createRuntimeApp} from './app.mjs';
import {HttpError} from '../src/httpError.ts';
import express from 'express';

// Open LAN demo: key stays on the server; browser cookies isolate anonymous data.
export function createMobileApp({mode='offline',apiKey='',runtimeOptions={}}={}){
 if(!['offline','live'].includes(mode))throw new Error('Invalid mobile mode');
 const live=mode==='live';
 if(live&&!apiKey)throw new Error('Live mobile mode requires a backend API key');
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
  if(!buyer)buyer=issue(req);
  return req[cache]='mobile_'+buyer;
 };
 const runtime=createRuntimeApp({...runtimeOptions,dbPath:':memory:',apiKey:live?apiKey:'',buyerId,improverOptions:{mode},purchaseOptions:{mode:'test'}});
 const app=express();app.locals.store=runtime.locals.store;
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 // Read-only compatibility/status route: even previously cached clients skip pairing.
 app.get('/api/mobile-session',(req,res)=>{buyerId(req);res.json({connected:true,mode,access:'open'});});
 app.use(runtime);
 return app;
}
