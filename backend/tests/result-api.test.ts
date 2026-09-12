import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import request from 'supertest';
import {afterEach,describe,expect,it} from 'vitest';
import {createApp,type CreateAppOptions} from '../src/app.js';
import {isValid} from '../src/schema.js';
import {runDemoPipeline} from '../src/mockResultProvider.js';
const dirs:string[]=[];const apps:Awaited<ReturnType<typeof createApp>>[]=[];
const baseline={intent_md:'辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。',preference_md:'價格優先，可接受免費滑鼠墊，不接受付費加購。'};
const now=()=>new Date('2026-09-12T02:00:00Z');
const dbPath=()=>{const dir=mkdtempSync(join(tmpdir(),'offermesh-result-'));dirs.push(dir);return join(dir,'result.sqlite');};
async function app(options:CreateAppOptions={}){const a=await createApp({dbPath:dbPath(),now,...options});apps.push(a);return a;}
afterEach(()=>{for(const a of apps.splice(0)){try{a.locals.store.close();}catch{}}for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
const create=(a:Awaited<ReturnType<typeof createApp>>,key='create',body:object=baseline)=>request(a).post('/api/requests').set('Idempotency-Key',key).send(body);
async function ready(a:Awaited<ReturnType<typeof createApp>>,key='create',body:object=baseline){const c=await create(a,key,body).expect(202);a.locals.store.processRequest(c.body.request_id);return (await request(a).get(`/api/requests/${c.body.request_id}`).expect(200)).body;}
const decide=(a:Awaited<ReturnType<typeof createApp>>,id:string,key:string,body:object)=>request(a).post(`/api/requests/${id}/decisions`).set('Idempotency-Key',key).send(body);

describe('Result v0.2 HTTP + SQLite',()=>{
 it('publishes valid immutable mock offers with unique per-request IDs',async()=>{
  const a=await app();const c=await create(a).expect(202);expect(c.body.status).toBe('formatting');expect(isValid('RequestSnapshot',c.body)).toBe(true);a.locals.store.processRequest(c.body.request_id);
  const s=(await request(a).get(`/api/requests/${c.body.request_id}`)).body;expect(s.status).toBe('awaiting_user');expect(s.seller_agents).toHaveLength(3);expect(s.ranked_offers).toHaveLength(4);expect(isValid('RequestSnapshot',s)).toBe(true);
  const again=await request(a).get(`/api/requests/${s.request_id}`);expect(again.body).toEqual(s);
  const other=await ready(a,'other');expect(other.offers.every((o:any)=>!s.offers.some((x:any)=>x.offer_id===o.offer_id))).toBe(true);
  const replay=await create(a).expect(202);expect(replay.body).toEqual(c.body);
 });
 it('accepts, persists and replays the original success after expiry and restart',async()=>{
  const path=dbPath();let clock=now();const a=await app({dbPath:path,now:()=>clock});const s=await ready(a);const body={action:'accept',offer_id:s.ranked_offers[0].offer_id};
  const accepted=await decide(a,s.request_id,'accept',body).expect(200);expect(isValid('AcceptDecisionResult',accepted.body)).toBe(true);
  clock=new Date(Date.parse(accepted.body.expires_at)+1);a.locals.store.close();apps.splice(apps.indexOf(a),1);
  const reopened=await app({dbPath:path,now:()=>clock});expect((await decide(reopened,s.request_id,'accept',body).expect(200)).body).toEqual(accepted.body);
  const read=(await request(reopened).get(`/api/requests/${s.request_id}`)).body;expect(read.decision).toEqual(accepted.body);expect(read.documents).toEqual(s.documents);expect(read.offers).toEqual(s.offers);
  await request(reopened).post('/api/redemptions').set('Idempotency-Key','x').send({}).expect(404);
 });
 it.each(['不要滑鼠墊，預算改成 800 元。','  不喜歡  '])('saves exact reject feedback without rewrite: %s',async feedback=>{
  const a=await app();const s=await ready(a);const body={action:'reject',feedback};const r=await decide(a,s.request_id,'reject',body).expect(200);
  expect(r.body).toEqual({action:'reject',request_id:s.request_id,status:'rejected',feedback,source_documents:s.documents});expect(isValid('RejectDecisionResult',r.body)).toBe(true);
  const after=(await request(a).get(`/api/requests/${s.request_id}`)).body;expect(after.decision).toEqual(r.body);expect(after.documents).toEqual(s.documents);expect(after.next_request_id).toBeNull();expect(after.offers).toEqual(s.offers);
  expect((await decide(a,s.request_id,'reject',body).expect(200)).body).toEqual(r.body);
  await decide(a,s.request_id,'opposite',{action:'accept',offer_id:s.ranked_offers[0].offer_id}).expect(409);
 });
 it('validates before key reservation and preserves Unicode feedback',async()=>{
  const a=await app();await request(a).post('/api/requests').send(baseline).expect(400);
  for(const body of [{...baseline,buyer_id:'other'},{intent_md:' '},{intent_md:'😀'.repeat(20001)}])await create(a,'bad',body).expect(400);
  await create(a,'bad').expect(202);const s=await ready(a,'valid');
  for(const feedback of [' ','😀'.repeat(2001)])await decide(a,s.request_id,'feedback',{action:'reject',feedback}).expect(400);
  await decide(a,s.request_id,'feedback',{action:'reject',feedback:'😀'.repeat(2000)}).expect(200);
  await request(a).post('/api/requests').set('Idempotency-Key','json').set('Content-Type','application/json').send('{').expect(400);
 });
 it('isolates buyers and unknown offers without enabling CORS',async()=>{
  let buyer='a';const a=await app({buyerId:()=>buyer});const s=await ready(a);
  buyer='b';await request(a).get(`/api/requests/${s.request_id}`).expect(404);await decide(a,s.request_id,'x',{action:'reject',feedback:'x'}).expect(404);
  buyer='a';await decide(a,s.request_id,'x',{action:'accept',offer_id:'foreign'}).expect(404);
  const r=await request(a).get(`/api/requests/${s.request_id}`).set('Origin','https://untrusted.example');expect(r.headers['access-control-allow-origin']).toBeUndefined();
 });
 it('rejects at exact expiry while GET keeps immutable offers and reject remains allowed',async()=>{
  let clock=now();const a=await app({now:()=>clock});const s=await ready(a);clock=new Date(s.offers[0].expires_at);
  await decide(a,s.request_id,'expired',{action:'accept',offer_id:s.ranked_offers[0].offer_id}).expect(410);
  expect((await request(a).get(`/api/requests/${s.request_id}`)).body.offers).toEqual(s.offers);
  await decide(a,s.request_id,'reject',{action:'reject',feedback:'expired'}).expect(200);
 });
 it('executes a genuine concurrent accept/reject race',async()=>{
  let entered!:()=>void,release!:()=>void;const enteredGate=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
  const a=await app({afterIdempotencyReserved:async({key})=>{if(key==='reject-race'){entered();await gate;}}});const s=await ready(a);
  const loser=decide(a,s.request_id,'reject-race',{action:'reject',feedback:'no'}).then(r=>r);await enteredGate;
  await decide(a,s.request_id,'winner',{action:'accept',offer_id:s.ranked_offers[0].offer_id}).expect(200);release();expect((await loser).status).toBe(409);
  expect((await request(a).get(`/api/requests/${s.request_id}`)).body.status).toBe('accepted');
 });
 it('returns retry guidance for an in-flight duplicate and rejects different canonical bodies',async()=>{
  let entered!:()=>void,release!:()=>void;const enteredGate=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
  const a=await app({afterIdempotencyReserved:async({key})=>{if(key==='slow'){entered();await gate;}}});const first=create(a,'slow').then(r=>r);await enteredGate;
  const duplicate=await create(a,'slow').expect(409);expect(duplicate.body.error.code).toBe('request_in_progress');expect(duplicate.headers['retry-after']).toBe('1');release();const created=await first;
  expect((await create(a,'slow',{preference_md:baseline.preference_md,intent_md:baseline.intent_md}).expect(202)).body).toEqual(created.body);
  expect((await create(a,'slow',{...baseline,preference_md:''}).expect(409)).body.error.code).toBe('idempotency_conflict');
 });
 it('rolls back both decision and idempotency result before commit',async()=>{
  let fail=false;const a=await app({beforeCommit:()=>{if(fail)throw new Error('injected commit failure');}});const s=await ready(a);fail=true;
  await decide(a,s.request_id,'retry',{action:'reject',feedback:'no'}).expect(500);expect((await request(a).get(`/api/requests/${s.request_id}`)).body.status).toBe('awaiting_user');
  fail=false;await decide(a,s.request_id,'retry',{action:'reject',feedback:'no'}).expect(200);
 });
 it('persists rejected handoff across restart and marks interrupted jobs failed without reprocessing',async()=>{
  const path=dbPath();const a=await app({dbPath:path,autoProcess:false});const s=await ready(a);const r=await decide(a,s.request_id,'reject',{action:'reject',feedback:'no'});const c=await create(a,'unfinished');a.locals.store.close();apps.splice(apps.indexOf(a),1);
  const reopened=await app({dbPath:path});expect((await request(reopened).get(`/api/requests/${s.request_id}`)).body.decision).toEqual(r.body);
  const interrupted=(await request(reopened).get(`/api/requests/${c.body.request_id}`)).body;expect(interrupted.error.code).toBe('processing_interrupted');reopened.locals.store.processRequest(c.body.request_id);expect((await request(reopened).get(`/api/requests/${c.body.request_id}`)).body).toEqual(interrupted);
 });
});
describe('mock input constraints',()=>{
 const run=(intent=baseline.intent_md,preference=baseline.preference_md)=>runDemoPipeline('req_test',{revision:1,intent_md:intent,preference_md:preference},now());
 it('supports the frontend default documents composed with a Chinese request',()=>{
  const result=run('# Buying intent\nFind a wireless mouse suitable for daily office work.\n\n## 本次購買需求\n'+baseline.intent_md,'# Preferences and limits\n- Prefer comfort and price\n- Accept a free mouse pad\n- Do not accept paid add-ons');
  expect(result.status).toBe('awaiting_user');expect(result.ranked_offers).toHaveLength(4);
 });
 it.each([
  ['辦公用無線滑鼠，預算 800 元含稅運，7 天內到貨。','不要滑鼠墊',1],
  ['辦公用無線滑鼠，預算 900 元含稅運，1 天內到貨。','',1],
  [baseline.intent_md,'不要滑鼠墊',3],
 ])('filters supported limits %s', (intent,pref,count)=>expect(run(intent,pref).ranked_offers).toHaveLength(count));
 it('returns no_match without raising budget',()=>expect(run('辦公用無線滑鼠，預算 100 元含稅運，7 天內到貨。','').status).toBe('no_match'));
 it.each(['想買鍵盤','無線滑鼠','辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。必須紅色','無線滑鼠，預算 900，預算 800，7 天內到貨。'])('clarifies unsupported/incomplete/conflicting input %s',intent=>expect(run(intent,'').status).toBe('needs_clarification'));
 it('does not treat contradictory accessory consent as permission',()=>expect(run(baseline.intent_md,'不要滑鼠墊，可接受免費滑鼠墊').status).toBe('needs_clarification'));
 it('does not invent feature or color requirements',()=>{const result=run();expect(result.intent?.required_features).toEqual(['wireless']);expect(result.intent?.product_preferences).toEqual([]);});
});
