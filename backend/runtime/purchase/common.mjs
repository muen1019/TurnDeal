import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../src/httpError.ts';
export const VERSION='2025-12-12';
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const json=v=>JSON.stringify(canonical(v));
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:json(v)).digest('hex');
export const fail=(status,code,message=code)=>{throw new HttpError(status,code,message);};
export function equal(a,b){const x=Buffer.from(a??''),y=Buffer.from(b??'');return x.length===y.length&&timingSafeEqual(x,y);}
export function secret(db,name){db.prepare('INSERT OR IGNORE INTO commerce_secrets VALUES(?,?)').run(name,randomBytes(32).toString('hex'));return db.prepare('SELECT value FROM commerce_secrets WHERE name=?').get(name).value;}
export const sign=(key,value)=>createHmac('sha256',key).update(value).digest('base64url');
export function token(key,payload){const encoded=Buffer.from(json(payload)).toString('base64url');return `${encoded}.${sign(key,encoded)}`;}
export function decode(key,value){try{const [data,sig,...rest]=String(value).split('.');if(rest.length||!equal(sig,sign(key,data)))return null;return JSON.parse(Buffer.from(data,'base64url'));}catch{return null;}}
export function headers(key,credential,method,path,body,now,id){const timestamp=new Date(now).toISOString();return {'Content-Type':'application/json',Authorization:`Bearer ${credential}`,'API-Version':VERSION,'Request-Id':id,'Idempotency-Key':id,Timestamp:timestamp,Signature:sign(key,`${timestamp}\n${method}\n${path}\n${body}`)};}
export function authenticate(req,key,credential,now){
  if(!equal(req.get('Authorization'),`Bearer ${credential}`)||req.get('API-Version')!==VERSION)fail(401,'authentication_required');
  const time=req.get('Timestamp');if(!Number.isFinite(Date.parse(time))||Math.abs(now-Date.parse(time))>300000)fail(401,'invalid_signature');
  if(!equal(req.get('Signature'),sign(key,`${time}\n${req.method}\n${req.path}\n${req.rawBody??''}`)))fail(401,'invalid_signature');
  if(!req.get('Request-Id'))fail(400,'invalid_request');
}
export function validateKey(key){if(typeof key!=='string'||!key.trim()||[...key].length>128||/sk-[A-Za-z0-9_-]{20,}/.test(key))fail(400,'invalid_request','需要有效 Idempotency-Key');}
export const amount=offer=>{const n=offer.total_price_twd*100;if(!Number.isSafeInteger(n)||n<=0)fail(409,'offer_changed');return n;};
