import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {validate,valid} from '../backend/runtime/purchase/contracts.mjs';
import {headers,secret,json,amount} from '../backend/runtime/purchase/common.mjs';
import {quoteFor} from '../backend/runtime/purchase/merchant.mjs';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const input={intent_md:'買無線滑鼠，預算1000元含稅運，7天內到貨。',preference_md:'價格優先，可接受免費滑鼠墊，不接受付費加購。'};
const details={buyer:{name:'測試買家',email:'buyer@example.com'},fulfillment_address:{name:'測試買家',line_one:'測試路123號',city:'Taipei',state:'TW-TPE',country:'TW',postal_code:'100'},fulfillment_option_id:'shipping_standard'};
const config={autoProcess:false,buyerId:r=>r.get('x-test-buyer')??'demo_buyer'};
const post=(app,path,key,body={})=>request(app).post(path).set('Idempotency-Key',key).send(body);
async function accepted(app,key='req',accept=true){const s=(await post(app,'/api/requests',key,input).expect(202)).body;await app.locals.store.process(s.request_id,'demo_buyer');const snap=app.locals.store.snapshot(s.request_id,'demo_buyer');assert.equal(snap.status,'awaiting_user');if(accept)await post(app,`/api/requests/${s.request_id}/decisions`,key+'accept',{action:'accept',offer_id:snap.ranked_offers[0].offer_id}).expect(200);return s.request_id;}
async function ready(app){const rid=await accepted(app);const created=await post(app,`/api/requests/${rid}/purchases`,'purchase');assert.equal(created.status,201,JSON.stringify(created.body));const p=created.body;validate('PurchaseView',p);const r=await post(app,`/api/purchases/${p.purchase_id}/checkout`,'update',details);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'ready');return r.body;}

test('ACP pinned schema hashes and request validation',()=>{
 const base=new URL('../contracts/acp/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));assert.equal(manifest.version,'2025-12-12');
 for(const [f,m]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL(f,base))).digest('hex'),m.sha256);
 assert.equal(valid('CheckoutSessionCreateRequest',{items:[{id:'mouse',quantity:1}]},true),true);
 assert.equal(valid('CheckoutSessionCreateRequest',{items:[{id:'mouse',quantity:0.5}]},true),false);
 assert.equal(valid('CheckoutUpdate',{...details,total_price_twd:1}),false);
 assert.equal(amount({total_price_twd:799}),79900);
 const q=quoteFor({purchase_id:'test',offer:{total_price_twd:799,delivery_days:5,terms_id:'terms',items:[{product_id:'mouse',quantity:1},{product_id:'pad',quantity:1}]}},Date.now());
 assert.deepEqual(q.line_items.map(x=>x.total),[79900,0]);
 assert.throws(()=>createRuntimeApp({...config,purchaseOptions:{mode:'live'}}),e=>e.code==='live_checkout_not_configured');
});

test('own UI API -> ACP HTTP -> immutable test order, replay, events and restart',async()=>{
 const dbPath=join(mkdtempSync(join(tmpdir(),'acp-purchase-')),'app.sqlite');const trace=[];
 let app=createRuntimeApp({...config,dbPath,purchaseOptions:{fetchImpl:async(u,o)=>{trace.push({path:new URL(u).pathname,method:o.method,version:o.headers['API-Version']});return fetch(u,o);}}});
 try{
 const p=await ready(app),path=`/api/purchases/${p.purchase_id}/complete`,payload={confirmation_token:p.confirmation_token};
 const frozen=app.locals.store.snapshot(p.request_id,'demo_buyer');
 const r=await post(app,path,'buy',payload);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'completed');assert.equal(r.body.order.payment_status,'simulated_succeeded');validate('PurchaseView',r.body);
 assert.deepEqual((await post(app,path,'buy',payload).expect(200)).body,r.body);
 assert.deepEqual((await post(app,path,'buy-again',payload).expect(200)).body,r.body);
 assert.deepEqual(app.locals.store.snapshot(p.request_id,'demo_buyer'),frozen);
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM merchant_orders').get().n,1);
 await app.locals.purchases.recover();assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM commerce_inbox').get().n,1);
 assert.ok(trace.some(x=>x.path.endsWith('/complete')));assert.ok(trace.every(x=>x.version==='2025-12-12'));
 const saved=r.body;await app.locals.store.close();app=createRuntimeApp({...config,dbPath});
 assert.deepEqual((await request(app).get(`/api/requests/${p.request_id}/purchase`).expect(200)).body,saved);
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM merchant_orders').get().n,1);
 assert.deepEqual(app.locals.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{await app.locals.store.close();}
});

test('accept required, unknown fields, buyer isolation and confirmation revision',async()=>{
 const app=createRuntimeApp(config);try{
 const id=await accepted(app,'unaccepted',false);await post(app,`/api/requests/${id}/purchases`,'invalid').expect(409);
 const p=await ready(app),base=`/api/purchases/${p.purchase_id}`;
 await request(app).get(base).set('x-test-buyer','other').expect(404);
 await post(app,base+'/complete','foreign',{confirmation_token:p.confirmation_token}).set('x-test-buyer','other').expect(404);
 await post(app,base+'/checkout','change-price',{total_price_twd:1}).expect(400);
 await post(app,base+'/complete','missing',{}).expect(400);
 await post(app,base+'/complete','fake',{confirmation_token:'invalid'}).expect(409);
 const updated=(await post(app,base+'/checkout','new-details',{buyer:{...details.buyer,name:'新版姓名'}}).expect(200)).body;
 await post(app,base+'/complete','old-token',{confirmation_token:p.confirmation_token}).expect(409);
 await post(app,base+'/checkout','new-details',{buyer:{...details.buyer,name:'另一個姓名'}}).expect(409);
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM merchant_orders').get().n,0);
 assert.equal(updated.checkout_revision,p.checkout_revision+1);
 }finally{await app.locals.store.close();}
});

test('concurrent different keys create exactly one order and consume inventory once',async()=>{
 const app=createRuntimeApp(config);try{const p=await ready(app),db=app.locals.store.db;
 const before=db.prepare('SELECT stock FROM merchant_inventory WHERE seller_id=? AND product_id=?').get(p.seller_id,p.offer.items[0].product_id).stock;
 const results=await Promise.all(['one','two'].map(k=>post(app,`/api/purchases/${p.purchase_id}/complete`,k,{confirmation_token:p.confirmation_token})));
 assert.ok(results.every(r=>[200,202].includes(r.status)),JSON.stringify(results.map(r=>r.body)));
 assert.equal(db.prepare('SELECT count(*) n FROM merchant_orders').get().n,1);
 assert.equal(db.prepare('SELECT stock FROM merchant_inventory WHERE seller_id=? AND product_id=?').get(p.seller_id,p.offer.items[0].product_id).stock,before-1);
 }finally{await app.locals.store.close();}
});

test('lost complete response reconciles after restart and expiry without paying twice',async()=>{
 const dbPath=join(mkdtempSync(join(tmpdir(),'acp-recovery-')),'app.sqlite');let now=Date.now(),drop=true;
 let app=createRuntimeApp({...config,dbPath,now:()=>now,purchaseOptions:{fetchImpl:async(u,o)=>{const r=await fetch(u,o);if(u.endsWith('/complete')&&drop){drop=false;throw new Error('response lost after commit');}return r;}}});
 try{const p=await ready(app);const r=await post(app,`/api/purchases/${p.purchase_id}/complete`,'buy',{confirmation_token:p.confirmation_token}).expect(202);assert.equal(r.body.status,'reconciling');
 await app.locals.store.close();now=Date.parse(p.expires_at)+1;app=createRuntimeApp({...config,dbPath,now:()=>now});await app.locals.purchases.recover();
 assert.equal((await request(app).get(`/api/purchases/${p.purchase_id}`).expect(200)).body.status,'completed');
 assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM merchant_orders').get().n,1);
 }finally{await app.locals.store.close();}
});

test('lost create response uses original operation to recover same checkout',async()=>{
 let drop=true,now=Date.now();const app=createRuntimeApp({...config,now:()=>now,purchaseOptions:{fetchImpl:async(u,o)=>{const r=await fetch(u,o);if(u.endsWith('/checkout_sessions')&&drop){drop=false;throw new Error('lost create');}return r;}}});
 try{const rid=await accepted(app);const p=(await post(app,`/api/requests/${rid}/purchases`,'create-purchase').expect(202)).body;now+=2000;await app.locals.purchases.recover();
 assert.equal((await request(app).get(`/api/purchases/${p.purchase_id}`).expect(200)).body.status,'needs_input');assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM merchant_checkout_sessions').get().n,1);
 }finally{await app.locals.store.close();}
});

test('expiry, inventory, cancellation, live rejection and invalid merchant response',async()=>{
 let now=Date.now();const app=createRuntimeApp({...config,now:()=>now});try{const p=await ready(app),base=`/api/purchases/${p.purchase_id}`;
 const c=(await post(app,base+'/cancel','cancel').expect(200)).body;assert.equal(c.status,'canceled');await post(app,base+'/complete','after-cancel',{confirmation_token:p.confirmation_token}).expect(409);
 }finally{await app.locals.store.close();}
 const expired=createRuntimeApp({...config,now:()=>now});try{const p=await ready(expired);now=Date.parse(p.expires_at)+1;await post(expired,`/api/purchases/${p.purchase_id}/complete`,'expired',{confirmation_token:p.confirmation_token}).expect(410);}finally{await expired.locals.store.close();}
 const stock=createRuntimeApp(config);try{const p=await ready(stock);stock.locals.store.db.prepare('UPDATE merchant_inventory SET stock=0').run();await post(stock,`/api/purchases/${p.purchase_id}/complete`,'stock',{confirmation_token:p.confirmation_token}).expect(409);assert.equal(stock.locals.store.db.prepare('SELECT count(*) n FROM merchant_orders').get().n,0);}finally{await stock.locals.store.close();}
 const bad=createRuntimeApp({...config,purchaseOptions:{fetchImpl:async(u,o)=>{const r=await fetch(u,o);return u.endsWith('/complete')?Response.json({status:'completed'}):r;}}});try{const p=await ready(bad);const r=await post(bad,`/api/purchases/${p.purchase_id}/complete`,'bad',{confirmation_token:p.confirmation_token}).expect(202);assert.equal(r.body.status,'reconciling');}finally{await bad.locals.store.close();}
});

test('signed webhook rejects spoofing and accepts duplicates without state regression',async()=>{
 const app=createRuntimeApp(config);try{const p=await ready(app),service=app.locals.purchases;await post(app,`/api/purchases/${p.purchase_id}/complete`,'buy',{confirmation_token:p.confirmation_token}).expect(200);
 const event=app.locals.store.db.prepare('SELECT * FROM commerce_outbox').get();const path=`/api/integrations/acp/merchants/${p.seller_id}/events`;
 await request(app).post(path).send(JSON.parse(event.body_json)).expect(401);
 const h=headers(secret(service.db,`event-sign:${p.seller_id}`),secret(service.db,`event-auth:${p.seller_id}`),'POST',path,event.body_json,service.store.now(),'event');
 for(let i=0;i<2;i++)await request(app).post(path).set(h).send(event.body_json).expect(200);
 assert.equal(service.db.prepare('SELECT count(*) n FROM commerce_inbox').get().n,1);assert.equal(service.load(p.purchase_id).status,'completed');
 }finally{await app.locals.store.close();}
});
