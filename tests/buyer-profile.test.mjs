import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {compareOffers} from '../src/evaluator/ranking.mjs';
import {rankCandidates} from '../src/orchestrator/discovery.ts';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const profile=JSON.parse(readFileSync(new URL('../contracts/fixtures/buyer-profile.json',import.meta.url),'utf8'));
test('profile persistence is buyer scoped, replay safe, and snapshots contain preferences not private checkout details',async()=>{
 const app=createRuntimeApp({autoProcess:false,buyerId:req=>req.headers['x-test-buyer']??'demo'}),store=app.locals.store;
 try{
  assert.equal((await request(app).get('/api/buyer-profile')).body.profile,null);
  const post=(body,key='profile')=>request(app).post('/api/buyer-profile').set('Idempotency-Key',key).send(body);
  await post(profile).expect(200);await post(profile).expect(200);
  await post({...profile,name:'changed'}).expect(409);
  await post({...profile,weights:{price:0,delivery:0,trust:0,color:0}},'bad').expect(400);
  await post({...profile,shipping_address:'4111111111111111'},'card').expect(400);
  await post({...profile,card_number:'4111111111111111'},'unknown').expect(400);
  assert.deepEqual((await request(app).get('/api/buyer-profile')).body.profile,profile);
  const legacy={...profile};delete legacy.shipping_details;
  await request(app).post('/api/buyer-profile').set('x-test-buyer','legacy').set('Idempotency-Key','legacy').send(legacy).expect(200);
  assert.equal((await request(app).get('/api/buyer-profile').set('x-test-buyer','other')).body.profile,null);
  const created=(await request(app).post('/api/requests').set('Idempotency-Key','buy').send({intent_md:'買無線滑鼠，預算1000元，7天內到貨'}).expect(202)).body;
  await post({...profile,weights:{price:0,delivery:100,trust:0,color:0}},'changed');
  await store.process(created.request_id,'demo');const result=store.snapshot(created.request_id,'demo');
  assert.equal(result.status,'awaiting_user',JSON.stringify(result.error));assert.deepEqual(result.intent.ranking_weights,profile.weights);
  assert.match(result.documents.preference_md,/黑色或藍色/);
  const formatter=store.db.prepare('SELECT input_json FROM formatter_runs WHERE request_id=?').get(created.request_id).input_json;
  const evaluation=store.db.prepare('SELECT input_json FROM evaluation_runs WHERE request_id=?').get(created.request_id).input_json;
  for(const text of [formatter,evaluation,JSON.stringify(result)]){assert.ok(!text.includes(profile.name));assert.ok(!text.includes(profile.shipping_address));assert.ok(!text.includes('payment_method'));}
  assert.ok(!formatter.includes(profile.shipping_details.email));assert.ok(!evaluation.includes(profile.shipping_details.email));
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM buyer_profiles').get().n,2);
 }finally{await store.close();}
});
test('weights change evaluator and discovery order; explicit intent priority overrides profile',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../contracts/fixtures/result-v0.3.json',import.meta.url),'utf8')).snapshot;
 const offers=fixture.offers.filter(o=>o.eligibility.status==='eligible').slice(0,2).map((o,i)=>({...o,total_price_twd:i?800:500,delivery_days:i?1:7}));
 const intent={...fixture.intent,preferences:[],ranking_weights:{price:100,delivery:0,trust:0,color:0}};
 const input={intent,offers,seller_trust:fixture.seller_agents.map(s=>({seller_id:s.seller_id,trust:s.trust})),color_matches:[]};
 assert.ok(compareOffers(input,offers[0],offers[1])<0);
 input.intent.ranking_weights={price:0,delivery:100,trust:0,color:0};assert.ok(compareOffers(input,offers[0],offers[1])>0);
 input.intent.product_preferences=[{preference_id:'blue',attribute:'color',operator:'in',strength:'preferred',values:['blue'],source_text:'偏好藍色'}];
 input.intent.ranking_weights={price:0,delivery:0,trust:0,color:100};input.color_matches=[{offer_id:offers[0].offer_id,score:0},{offer_id:offers[1].offer_id,score:100}];assert.ok(compareOffers(input,offers[0],offers[1])>0);
 input.intent.preferences=['price_first'];assert.ok(compareOffers(input,offers[0],offers[1])<0);
 const catalog={snapshot_id:'s',source_snapshot_id:'s',campaigns:[],sellers:[0,1].map(i=>({seller_id:'s'+i,name:'s'+i,enabled:true,rating:4,rating_count:10})),listings:[0,1].map(i=>({listing_id:'p'+i,product_id:'p'+i,seller_id:'s'+i,name:'mouse',category:'mouse',features:['wireless'],attributes:{color:i?'blue':'black'},item_price_twd:i?800:500,shipping_twd:0,price_includes_tax:true,rating:4,rating_count:10,stock:1,delivery_days:i?1:7}))};
 const query={category:'mouse',max_total_twd:1000,delivery_days_max:7,ranking_weights:{price:100,delivery:0,trust:0,color:0}};
 assert.equal(rankCandidates(catalog,query,new Date().toISOString()).candidates[0].seller.seller_id,'s0');
 query.ranking_weights={price:0,delivery:100,trust:0,color:0};assert.equal(rankCandidates(catalog,query,new Date().toISOString()).candidates[0].seller.seller_id,'s1');
});
