import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {ensureImprovementChild} from '../backend/runtime/improver-followup.mjs';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');
const options={autoProcess:false,buyerId:r=>r.get('x-buyer')??'followup',now:()=>Date.parse('2026-09-12T02:00:00Z')};
const post=(app,path,body,key)=>request(app).post(path).set('Idempotency-Key',key).send(body);
async function setup(extra={}){
  const app=createRuntimeApp({...options,...extra}),store=app.locals.store;
  const initial=(await post(app,'/api/requests',{intent_md:'無線靜音滑鼠，預算 1000 元，7天內到貨。',preference_md:''},'create').expect(202)).body;
  await store.process(initial.request_id,'followup');const s=store.snapshot(initial.request_id,'followup');
  return {app,store,s,id:s.request_id,path:`/api/requests/${s.request_id}/improvement`};
}
async function reject(f,feedback=''){
  await post(f.app,`/api/requests/${f.id}/decisions`,{action:'reject',selection_version:1,rejected_offer_ids:f.s.ranked_offers.map(o=>o.offer_id),feedback},'reject').expect(200);
  return done(f);
}
async function done(f){
  for(let i=0;i<100;i++){
    const r=(await request(f.app).get(f.path).expect(200)).body;
    if(r&&!['queued','running'].includes(r.status))return r;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('worker did not finish');
}

test('ready creates exactly one frozen child with full pipeline and immutable parent',async()=>{
  const f=await setup();try{
    const r=await reject(f,'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。');
    if(r.workflow_error)ensureImprovementChild(f.store,f.app.locals.improver.repository.get('followup',r.improvement_id));
    assert.equal(r.status,'ready');assert.equal(r.workflow_error,null);assert.ok(r.next_request_id);
    const child=f.store.snapshot(r.next_request_id,'followup');
    assert.equal(child.parent_request_id,f.id);assert.equal(child.root_request_id,f.id);assert.equal(child.documents.revision,2);assert.deepEqual(child.documents,r.result.documents);
    // Later global edits must not affect the committed child.
    f.app.locals.improver.repository.saveGlobalPreference('followup','後來的任意新偏好',r.result.preference_updated?1:0);
    await f.store.process(child.request_id,'followup');
    const ready=f.store.snapshot(child.request_id,'followup');assert.equal(ready.status,'awaiting_user',JSON.stringify(ready.error));assert.equal(ready.intent.max_total_twd,800);assert.equal(ready.parent_request_id,f.id);
    assert.deepEqual(ready.documents,r.result.documents);assert.deepEqual(f.store.snapshot(f.id,'followup').documents,f.s.documents);
    assert.equal((await done(f)).next_request_id,child.request_id);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM requests WHERE parent_request_id=?').get(f.id).n,1);
  }finally{await f.store.close();}
});

test('clarification creates immutable successor; exact replay, stale keys and buyer scope',async()=>{
  const f=await setup();try{
    const draft=await reject(f);assert.equal(draft.can_clarify,true);assert.equal(draft.next_request_id,null);
    const old=f.app.locals.improver.repository.get('followup',draft.improvement_id);
    const body={improvement_id:draft.improvement_id,feedback:'這次預算改成 800 元。'};
    await post(f.app,f.path+'/clarifications',body,'other').set('x-buyer','other').expect(404);
    const response=(await post(f.app,f.path+'/clarifications',body,'clarify').expect(202)).body;
    assert.notEqual(response.improvement_id,draft.improvement_id);
    assert.deepEqual((await post(f.app,f.path+'/clarifications',body,'clarify').expect(202)).body,response);
    await post(f.app,f.path+'/clarifications',body,'stale').expect(409);
    await post(f.app,f.path+'/clarifications',{...body,feedback:'這次預算改成 900 元。'},'clarify').expect(409);
    const r=await done(f);assert.equal(r.status,'ready');assert.ok(r.next_request_id);assert.equal(r.result.preference_updated,false);
    assert.deepEqual(f.app.locals.improver.repository.get('followup',draft.improvement_id),old);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM improver_jobs WHERE parent_request_id=?').get(f.id).n,2);
  }finally{await f.store.close();}
});

test('clarification transaction failure preserves old draft and original retry key',async()=>{
  const f=await setup();try{
    const draft=await reject(f),body={improvement_id:draft.improvement_id,feedback:'這次預算改成 800 元。'};
    f.store.db.exec("CREATE TRIGGER stop_successor BEFORE UPDATE OF current_improvement_id ON improver_workflows BEGIN SELECT RAISE(ABORT,'test'); END");
    await post(f.app,f.path+'/clarifications',body,'clarify').expect(500);
    assert.equal((await done(f)).improvement_id,draft.improvement_id);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM improver_jobs WHERE parent_request_id=?').get(f.id).n,1);
    f.store.db.exec('DROP TRIGGER stop_successor');await post(f.app,f.path+'/clarifications',body,'clarify').expect(202);
    assert.ok((await done(f)).next_request_id);
  }finally{await f.store.close();}
});

test('failed child link rolls back creation; recovery uses the committed preference despite a later edit',async()=>{
  const f=await setup();try{
    f.store.db.exec("CREATE TRIGGER stop_child BEFORE UPDATE OF next_request_id ON improver_workflows BEGIN SELECT RAISE(ABORT,'test'); END");
    const r=await reject(f,'這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。');
    assert.equal(r.status,'ready');assert.equal(r.workflow_error,'child_creation_failed');assert.equal(r.next_request_id,null);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM requests WHERE parent_request_id=?').get(f.id).n,0);
    f.app.locals.improver.repository.saveGlobalPreference('followup','後來改成其他偏好',1);
    f.store.db.exec('DROP TRIGGER stop_child');
    const child=ensureImprovementChild(f.store,f.app.locals.improver.repository.get('followup',r.improvement_id));
    await f.store.process(child,'followup');
    const snapshot=f.store.snapshot(child,'followup');assert.equal(snapshot.status,'awaiting_user');
    assert.deepEqual(snapshot.documents,r.result.documents);
    assert.ok(snapshot.intent.product_preferences.some(p=>p.attribute==='size_class'&&p.values.includes('small')));
    assert.equal((await done(f)).next_request_id,child);
  }finally{await f.store.close();}
});

test('restart dispatches an undispatched committed child without creating another',async()=>{
  const dbPath=join(mkdtempSync(join(tmpdir(),'improver-child-')),'app.sqlite');
  const f=await setup({dbPath});const ready=await reject(f,'這次預算改成 800 元。');
  assert.ok(ready.next_request_id);await f.store.close();
  const app=createRuntimeApp({...options,dbPath,autoProcess:true});
  try{
    for(let i=0;i<100&&app.locals.store.snapshot(ready.next_request_id,'followup').status!=='awaiting_user';i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(app.locals.store.snapshot(ready.next_request_id,'followup').status,'awaiting_user');
    assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM requests WHERE parent_request_id=?').get(f.id).n,1);
    assert.deepEqual(app.locals.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await app.locals.store.close();}
});

test('each further round requires a new user event and retains the original root',async()=>{
  const f=await setup();try{
    const first=await reject(f,'這次預算改成 800 元。');
    await f.store.process(first.next_request_id,'followup');
    const s=f.store.snapshot(first.next_request_id,'followup');
    const next={...f,id:s.request_id,s,path:`/api/requests/${s.request_id}/improvement`};
    assert.equal((await request(f.app).get(next.path)).body,null);
    const draft=await reject(next);assert.equal(draft.next_request_id,null);
    await post(f.app,next.path+'/clarifications',{improvement_id:draft.improvement_id,feedback:'這次預算改成 700 元。'},'round-3').expect(202);
    const result=await done(next);assert.ok(result.next_request_id);
    await f.store.process(result.next_request_id,'followup');
    const last=f.store.snapshot(result.next_request_id,'followup');
    assert.equal(last.root_request_id,f.id);assert.equal(last.parent_request_id,s.request_id);assert.equal(last.documents.revision,3);
    assert.equal(last.status,'awaiting_user');assert.equal(last.intent.max_total_twd,700);
    assert.equal((await request(f.app).get(`/api/requests/${last.request_id}/improvement`)).body,null);
  }finally{await f.store.close();}
});

test('upgrade populated pre-followup jobs preserves revisions and does not enroll historical decisions',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'improver-upgrade-')),dbPath=join(dir,'app.sqlite');
  const f=await setup({dbPath}),r=await reject(f),saved=f.app.locals.improver.repository.get('followup',r.improvement_id),snapshot=f.store.snapshot(f.id,'followup');
  await f.store.close();
  const db=new DatabaseSync(dbPath);
  const rows=db.prepare('SELECT * FROM improver_jobs').all();
  const old=readFileSync(new URL('../db/migrations/004_buyer_request_improver.sql',import.meta.url),'utf8');
  const definition=old.slice(old.indexOf('CREATE TABLE improver_jobs'),old.indexOf('CREATE TABLE improver_intent_revisions'));
  db.exec('PRAGMA foreign_keys=OFF; BEGIN; DROP TABLE improver_workflows; DROP TABLE improver_jobs;');db.exec(definition);
  for(const row of rows){delete row.source_improvement_id;const keys=Object.keys(row);db.prepare(`INSERT INTO improver_jobs(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
  db.exec("DELETE FROM schema_migrations WHERE version='006_improver_followups'; COMMIT;");db.close();
  const app=createRuntimeApp({...options,dbPath});try{
    assert.deepEqual(app.locals.improver.repository.get('followup',r.improvement_id),saved);
    assert.deepEqual(app.locals.store.snapshot(f.id,'followup'),snapshot);
    assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM improver_workflows').get().n,0);
    assert.equal(app.locals.store.db.prepare('SELECT count(*) n FROM improver_intent_revisions').get().n,1);
    assert.ok(readdirSync(dir).some(name=>name.startsWith('app.sqlite.backup-')));
    assert.deepEqual(app.locals.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>app.locals.store.db.prepare("UPDATE improver_jobs SET status='queued' WHERE improvement_id=?").run(r.improvement_id),/immutable/);
  }finally{await app.locals.store.close();}
});
