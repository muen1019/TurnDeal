import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import initSqlJs from 'sql.js';
import request from 'supertest';
import {afterEach,describe,expect,it} from 'vitest';
import {createApp} from '../src/app.js';
import {runDemoPipeline} from '../src/mockResultProvider.js';
import {contractFile} from '../src/paths.js';
import {isValid} from '../src/schema.js';
const apps:Awaited<ReturnType<typeof createApp>>[]=[];const dirs:string[]=[];
const now=()=>new Date('2026-09-12T02:00:00Z');
const baseline={revision:1,intent_md:'辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。',preference_md:'可接受免費滑鼠墊'};
afterEach(()=>{for(const a of apps.splice(0))a.locals.store.close();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
describe('unified v0.3 contract and persistence',()=>{
 it('uses the five-seller catalog, source prices, early finals, and complete history',()=>{
  const result=runDemoPipeline('req_five',baseline,now());
  expect(result.seller_agents.map(s=>s.rounds.length)).toEqual([5,5,5,3,1]);
  expect(result.seller_agents.map(s=>s.stop_reason)).toEqual(['max_rounds','max_rounds','max_rounds','seller_final','seller_final']);
  expect(result.seller_agents.slice(3).every(s=>s.rounds.at(-1)?.is_final)).toBe(true);
  expect(result.ranked_offers.map(r=>result.offers.find(o=>o.offer_id===r.offer_id)!.total_price_twd)).toEqual([549,629,629,639,679,719]);
  const ids=new Set(result.offers.map(o=>o.offer_id));
  for(const seller of result.seller_agents){for(const round of seller.rounds)for(const id of round.offer_ids)expect(ids.has(id)).toBe(true);expect(seller.rounds.slice(0,-1).every(r=>!r.is_final)).toBe(true);}
 });
 it('accepts the main canonical intent and returns only eligible selected sellers',()=>{
  const fixture=JSON.parse(readFileSync(contractFile('fixtures/happy-path.json'),'utf8'));
  expect(runDemoPipeline('req_main',fixture.snapshot.documents,now()).ranked_offers).toHaveLength(6);
  const filtered=runDemoPipeline('req_small',{...baseline,intent_md:'無線滑鼠，預算 600 元，7 天內到貨。'},now());
  expect(filtered.seller_agents.map(s=>s.seller_id)).toEqual(['seller_a']);expect(filtered.sponsored_placement).toBeNull();
 });
 it.each(['accept','reject'] as const)('migrates legacy %s with backup, original quotes and exact replay',async action=>{
  const dir=mkdtempSync(join(tmpdir(),'offermesh-migration-'));dirs.push(dir);const path=join(dir,'legacy.sqlite');
  const SQL=await initSqlJs();const db=new SQL.Database();
  const old=JSON.parse(readFileSync(contractFile('archive/result-snapshot.v0.2.json'),'utf8')).snapshot;
  const offer=old.offers.find((o:any)=>o.offer_id===old.ranked_offers[0].offer_id);
  const body=action==='accept'?{action,offer_id:offer.offer_id}:{action,feedback:'  old feedback  '};
  const decision=action==='accept'?{action,request_id:old.request_id,status:'accepted',selected_offer_id:offer.offer_id,expires_at:offer.expires_at}:{action,request_id:old.request_id,status:'rejected',feedback:'  old feedback  ',source_documents:old.documents};
  old.status=decision.status;old.selected_offer_id=action==='accept'?offer.offer_id:null;old.decision=decision;
  db.run('PRAGMA user_version=2; CREATE TABLE requests(id TEXT PRIMARY KEY,buyer TEXT,snapshot TEXT); CREATE TABLE offers(id TEXT,request_id TEXT,body TEXT); CREATE TABLE decisions(request_id TEXT,body TEXT); CREATE TABLE idempotency(buyer TEXT,method TEXT,path TEXT,key TEXT,hash TEXT,state TEXT,status INTEGER,body TEXT);');
  db.run('INSERT INTO requests VALUES(?,?,?)',[old.request_id,'demo_buyer',JSON.stringify(old)]);
  db.run('INSERT INTO decisions VALUES(?,?)',[old.request_id,JSON.stringify(decision)]);
  db.run('INSERT INTO idempotency VALUES(?,?,?,?,?,?,?,?)',['demo_buyer','POST',`/api/requests/${old.request_id}/decisions`,'old-key',createHash('sha256').update(JSON.stringify(body)).digest('hex'),'completed',200,JSON.stringify(decision)]);
  writeFileSync(path,db.export());db.close();
  const original=readFileSync(path);const app=await createApp({dbPath:path,now:()=>new Date('2026-09-14T00:00:00Z')});apps.push(app);
  const got=(await request(app).get('/api/requests/'+old.request_id).expect(200)).body;
  expect(isValid('RequestSnapshot',got)).toBe(true);expect(got.offers).toEqual(old.offers);expect(got.documents).toEqual(old.documents);expect(got.decision).toEqual(decision);
  const replay=await request(app).post(`/api/requests/${old.request_id}/decisions`).set('Idempotency-Key','old-key').send(body).expect(200);expect(replay.body).toEqual(decision);
  const backup=readdirSync(dir).find(n=>n.includes('.pre-v03-'))!;expect(readFileSync(join(dir,backup))).toEqual(original);
  const persisted=new SQL.Database(readFileSync(path));
  expect(persisted.exec('PRAGMA foreign_key_check')).toEqual([]);expect(persisted.exec('SELECT count(*) FROM schema_migrations')[0].values[0][0]).toBe(7);
  expect(persisted.exec('SELECT total_price_twd FROM offers WHERE offer_id=?',[offer.offer_id])[0].values[0][0]).toBe(offer.total_price_twd);persisted.close();
 });
 it('stores decision state without modifying the published snapshot or inventory',async()=>{
  const app=await createApp({dbPath:':memory:',now,autoProcess:false});apps.push(app);
  const c=await request(app).post('/api/requests').set('Idempotency-Key','create').send({intent_md:baseline.intent_md,preference_md:baseline.preference_md}).expect(202);
  app.locals.store.processRequest(c.body.request_id);
  const db=(app.locals.store as any).db as initSqlJs.Database;
  const frozen=db.exec('SELECT published_snapshot_json FROM requests')[0].values[0][0];
  const stock=db.exec('SELECT stock FROM seller_inventory').map(row=>row.values);
  const reject=await request(app).post(`/api/requests/${c.body.request_id}/decisions`).set('Idempotency-Key','reject').send({action:'reject',feedback:'  maybe later  '}).expect(200);
  expect(db.exec('SELECT published_snapshot_json FROM requests')[0].values[0][0]).toBe(frozen);expect(db.exec('SELECT stock FROM seller_inventory').map(row=>row.values)).toEqual(stock);
  expect(JSON.parse(String(db.exec('SELECT result_json FROM decisions')[0].values[0][0]))).toEqual(reject.body);
  expect(()=>db.run('UPDATE decisions SET result_json=\'{}\'')).toThrow(/immutable/);
 });
});
