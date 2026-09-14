import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createPublicGateway} from '../scripts/public-gateway.mjs';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const origin='https://demo-test.trycloudflare.com',host=new URL(origin).host;
test('public gateway restricts host/origin/routes/body, proxies cookies safely, bounds writes',async()=>{
 const server=createServer((req,res)=>{
  assert.equal(req.headers.authorization,undefined);
  assert.equal(req.headers['x-forwarded-host'],undefined);
  if(req.method==='POST')assert.equal(req.headers.origin,`http://127.0.0.1:${server.address().port}`);
  res.setHeader('Set-Cookie','turndeal_live=synthetic; Path=/; HttpOnly; SameSite=Strict');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cookie:req.headers.cookie??null}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const app=createPublicGateway({dist:fileURLToPath(new URL('../frontend/dist',import.meta.url)),backend:`http://127.0.0.1:${server.address().port}`,getOrigin:()=>origin,maxWrites:2});
 try{
  await request(app).get('/api/mobile-session').set('Host','attacker.test').expect(403);
  await request(app).post('/api/buyer-profile').set('Host',host).set('Origin','https://attacker.test').expect(403);
  await request(app).get('/api/integrations/acp/merchants/a/events').set('Host',host).expect(404);
  for(const path of ['/src/main.tsx','/@fs/package.json','/.env','/assets/x.js.map','/package.json'])await request(app).get(path).set('Host',host).expect(404);
  const session=await request(app).get('/api/mobile-session').set('Host',host).set('Authorization','Bearer not-forwarded').set('X-Forwarded-Host','attacker.test').expect(200);
  assert.match(session.headers['set-cookie'][0],/; Secure$/);
  const result=await request(app).post('/api/buyer-profile').set('Host',host).set('Origin',origin).set('Cookie','turndeal_live=synthetic').send({test:true}).expect(200);
  assert.equal(result.body.cookie,'turndeal_live=synthetic');
  await request(app).post('/api/requests').set('Host',host).set('Origin',origin).send({text:'a'.repeat(270000)}).expect(413);
  await request(app).post('/api/requests').set('Host',host).set('Origin',origin).send({}).expect(429);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
