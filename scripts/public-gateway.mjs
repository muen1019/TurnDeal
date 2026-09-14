import {createRequire} from 'node:module';
import {request as httpRequest} from 'node:http';
import {resolve} from 'node:path';
const express=createRequire(new URL('../backend/package.json',import.meta.url))('express');

// Only compiled UI and buyer-facing APIs leave the machine. Never proxy Vite.
export function createPublicGateway({dist,backend='http://127.0.0.1:3203',getOrigin,
 maxWrites=120,writesPerMinute=30,now=Date.now}={}){
 const upstream=new URL(backend),app=express();
 let writes=0,windowStart=now(),windowWrites=0;
 const fail=(res,status,code,message)=>res.status(status).json({error:{code,message,fields:[]}});
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  const origin=getOrigin();
  if(!origin||req.headers.host!==new URL(origin).host)return fail(res,403,'invalid_host','請使用本次產生的 Demo 網址。');
  if(!['GET','HEAD','POST'].includes(req.method))return fail(res,405,'method_not_allowed','不支援的操作。');
  if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==origin)
   return fail(res,403,'origin_mismatch','請從同一個 Demo 網址操作。');
  // Allow people to open the shared link from chats; block cross-site API/subresource use.
  if(req.headers['sec-fetch-site']==='cross-site'&&!(req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'))return fail(res,403,'cross_site','不接受跨網站請求。');
  next();
 });
 app.use((req,res,next)=>{
  if(!req.path.startsWith('/api/'))return next();
  // Merchant webhook and private/local routes are deliberately not exposed.
  if(!/^\/api\/(?:mobile-session|buyer-profile|requests(?:\/[\w-]+(?:\/(?:decisions|purchases|purchase|improvement(?:\/clarifications)?))?)?|purchases\/[\w-]+(?:\/(?:checkout|complete|cancel))?)$/.test(req.path))
   return fail(res,404,'not_found','找不到這個資源。');
  if(req.method==='POST'){
   if(now()-windowStart>=60000){windowStart=now();windowWrites=0;}
   if(writes>=maxWrites||windowWrites>=writesPerMinute){res.setHeader('Retry-After','60');return fail(res,429,'demo_limit','Demo 使用次數已達上限，請聯絡展示者。');}
   writes++;windowWrites++;
  }
  // Buffer a bounded body; don't forward attacker-controlled proxy/auth headers.
  const chunks=[];let size=0,large=false;
  req.on('data',chunk=>{size+=chunk.length;if(size>256*1024){large=true;chunks.length=0;}else if(!large)chunks.push(chunk);});
  req.on('end',()=>{
   if(large)return fail(res,413,'body_too_large','輸入內容過長。');
   const body=Buffer.concat(chunks),headers={host:upstream.host};
   for(const name of ['cookie','content-type','accept','idempotency-key'])if(req.headers[name])headers[name]=req.headers[name];
   // Origin checked above. Existing loopback API expects its local HTTP origin.
   if(req.headers.origin)headers.origin=upstream.origin;
   headers['content-length']=String(body.length);
   const proxy=httpRequest({hostname:upstream.hostname,port:upstream.port,path:req.originalUrl,method:req.method,headers},response=>{
    res.status(response.statusCode??502);
    for(const name of ['content-type','retry-after'])if(response.headers[name])res.setHeader(name,response.headers[name]);
    if(response.headers['set-cookie'])res.setHeader('Set-Cookie',response.headers['set-cookie'].map(cookie=>/;\s*Secure(?:;|$)/i.test(cookie)?cookie:cookie+'; Secure'));
    response.on('error',()=>res.destroy());response.pipe(res);
   });
   proxy.setTimeout(15000,()=>proxy.destroy());
   proxy.on('error',()=>{if(!res.headersSent)fail(res,502,'backend_unavailable','本機服務未啟動，請聯絡展示者。');else res.destroy();});
   res.on('close',()=>proxy.destroy());proxy.end(body);
  });
 });
 app.use((req,res,next)=>{
  if(req.method==='POST')return fail(res,404,'not_found','找不到這個資源。');
  if(req.path.includes('\\')||req.path.split('/').some(part=>part.startsWith('.'))||/\.(?:map|ts|tsx|mjs)$/i.test(req.path))return res.sendStatus(404);
  next();
 });
 app.use(express.static(resolve(dist),{dotfiles:'deny',index:false,redirect:false}));
 app.use((req,res)=>{
  if(req.path==='/'||/^\/(?:chat|requests|settings|history|setup|preferences|purchases|checkout)(?:\/[^.]*)?$/.test(req.path))return res.sendFile(resolve(dist,'index.html'));
  res.sendStatus(404);
 });
 return app;
}
