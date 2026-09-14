import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createMobileApp} from '../backend/runtime/mobile-app.mjs';
import {mobileConfig} from '../scripts/mobile-config.mjs';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
test('mobile demo isolates browsers, rejects forged cookies and cross-origin writes, persists shipping without live AI',async()=>{
 const app=createMobileApp(),a=request.agent(app),b=request.agent(app);
 const profile={name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:{email:'buyer@example.test',city:'台北市',state:'中正區',postal_code:'100',country:'TW'},payment_method:'later',weights:{price:45,delivery:20,trust:20,color:15},colors:[]};
 try{
  const first=await a.get('/api/buyer-profile').expect(200);
  assert.match(first.headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
  await a.post('/api/buyer-profile').set('Idempotency-Key','profile').send(profile).expect(200);
  assert.deepEqual((await a.get('/api/buyer-profile')).body.profile,profile);
  assert.equal((await b.get('/api/buyer-profile')).body.profile,null);
  const cookie=first.headers['set-cookie'][0].split(';')[0];
  const forged=cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0');
  assert.equal((await request(app).get('/api/buyer-profile').set('Cookie',forged)).body.profile,null);
  await a.post('/api/buyer-profile').set('Origin','http://attacker.test').set('Idempotency-Key','cross').send(profile).expect(403);
  await a.post('/api/buyer-profile').set('Idempotency-Key','bad').send({...profile,shipping_details:{...profile.shipping_details,email:'not-email'}}).expect(400);
  assert.equal(app.locals.store.apiKey,'');
 }finally{await app.locals.store.close();}
});
test('live launcher isolates backend credentials and uses distinct ports',()=>{
 const key='sk-'+('test'.repeat(9));
 const source={OPENAI_API_KEY:key,API_KEY:'another-secret',VITE_API_KEY:'never-ship',OFFERMESH_DB_PATH:'private.sqlite',PATH:'runtime'};
 const live=mobileConfig(source,true),offline=mobileConfig(source,false);
 assert.equal(live.uiPort,5176);assert.equal(live.apiPort,3203);
 assert.equal(live.backendEnv.OPENAI_API_KEY,key);
 assert.ok(!Object.keys(live.frontendEnv).some(k=>/KEY|TOKEN|SECRET|PASSWORD|DB_PATH/i.test(k)));
 assert.ok(!Object.keys(offline.backendEnv).some(k=>/KEY|TOKEN|SECRET|PASSWORD|DB_PATH/i.test(k)));
 assert.equal(offline.frontendEnv.OFFERMESH_RUNTIME_MODE,'offline');
 assert.throws(()=>mobileConfig({},true),/dev:mobile:secure/);
});
test('open live API requires no pairing, but isolates buyers and blocks cross-origin writes',async()=>{
 const app=createMobileApp({mode:'live',apiKey:'unit-test-only',runtimeOptions:{autoProcess:false}});
 const profile={name:'Demo A',shipping_address:'測試路 1 號',payment_method:'later',weights:{price:45,delivery:20,trust:20,color:15},colors:[]};
 try{
  const a=request.agent(app),b=request.agent(app);
  const session=await a.get('/api/mobile-session').expect(200);
  assert.deepEqual(session.body,{connected:true,mode:'live',access:'open'});
  await a.post('/api/buyer-profile').set('Idempotency-Key','profile').send(profile).expect(200);
  assert.deepEqual((await a.get('/api/buyer-profile')).body.profile,profile);
  assert.equal((await b.get('/api/buyer-profile').expect(200)).body.profile,null);
  await b.post('/api/buyer-profile').set('Idempotency-Key','foreign').set('Origin','http://foreign.test').send(profile).expect(403);
  const cookie=session.headers['set-cookie'][0].split(';')[0];
  const forged=cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0');
  assert.equal((await request(app).get('/api/buyer-profile').set('Cookie',forged)).body.profile,null);
  const created=(await a.post('/api/requests').set('Idempotency-Key','new').send({intent_md:'买無線滑鼠，最高1000元，7天內到貨'}).expect(202)).body;
  await a.get('/api/requests/'+created.request_id).expect(200);
  await b.get('/api/requests/'+created.request_id).expect(404);
  await a.post('/api/mobile-session').send({code:'obsolete'}).expect(404);
  assert.equal(app.locals.store.apiKey,'unit-test-only');
 }finally{await app.locals.store.close();}
});
test('unpaired live request invokes the LLM formatter transport and replay does not call it twice',async()=>{
 let calls=0;
 const noNetwork=async()=>{throw Error('test: no external network');};
 const extraction={category:'mouse',max_total_twd:1000,target_total_twd:null,delivery_days_max:7,budget_evidence:'最高1000元',target_evidence:'',delivery_evidence:'7天內到貨',required_features:['wireless'],preferences:[],product_preferences:[],bundle_mode:'related_no_extra_cost',questions:[],unsupported_conditions:[]};
 const app=createMobileApp({mode:'live',apiKey:'unit-test-only',runtimeOptions:{autoProcess:false,
  formatterOptions:{fetch:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(JSON.parse(options.body).model,'gpt-4.1-mini');return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(extraction)}]}]});}},
  negotiationOptions:{fetchImpl:noNetwork},evaluatorOptions:{fetchImpl:noNetwork}}});
 try{
  const a=request.agent(app);
  const post=()=>a.post('/api/requests').set('Idempotency-Key','same-live-request').send({intent_md:'買無線滑鼠，最高1000元，7天內到貨',model:'gpt-4.1-mini'});
  const first=(await post().expect(202)).body,id=first.request_id;
  const buyer=app.locals.store.db.prepare('SELECT user_id FROM requests WHERE request_id=?').get(id).user_id;
  await app.locals.store.process(id,buyer);
  const snapshot=(await a.get('/api/requests/'+id).expect(200)).body;
  assert.equal(snapshot.formatter.provider,'openai');assert.equal(snapshot.status,'awaiting_user');
  assert.equal((await post()).body.request_id,id);
  await app.locals.store.process(id,buyer);assert.equal(calls,1);
 }finally{await app.locals.store.close();}
});
