import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {createRuntimeApp} from './app.mjs';
import {HttpError} from '../src/httpError.ts';

// Ephemeral demo only: no live credentials, no persistent personal database.
export function createMobileApp(){
 const secret=randomBytes(32),cache=Symbol('mobileBuyer');
 const sign=id=>createHmac('sha256',secret).update(id).digest('hex');
 const buyerId=req=>{
  if(req[cache])return req[cache];
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)
   throw new HttpError(403,'origin_mismatch','請從同一個 Demo 網址操作。');
  const token=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('turndeal_demo='))?.slice(14);
  const [id,signature]=token?.split('.')??[];
  let buyer;
  if(id&&/^[a-f0-9-]{36}$/.test(id)&&signature&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(sign(id))))buyer=id;
  else{
   buyer=randomUUID();
   req.res.setHeader('Set-Cookie',`turndeal_demo=${buyer}.${sign(buyer)}; Path=/; HttpOnly; SameSite=Strict`);
  }
  return req[cache]='mobile_'+buyer;
 };
 return createRuntimeApp({dbPath:':memory:',apiKey:'',buyerId,improverOptions:{mode:'offline'},purchaseOptions:{mode:'test'}});
}
