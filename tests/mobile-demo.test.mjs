import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createMobileApp} from '../backend/runtime/mobile-app.mjs';
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
