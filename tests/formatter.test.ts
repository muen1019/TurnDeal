import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { formatIntent } from '../src/formatter/parser.ts';
import { createFormatterService } from '../src/formatter/service.ts';
import { initializeDatabase, applyMigrations } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { toDiscoveryQuery } from '../src/orchestrator/handoff.ts';
import type { SellerHandler } from '../src/orchestrator/handoff.ts';
const scenarios=JSON.parse(readFileSync(new URL('../contracts/fixtures/formatter-scenarios.json',import.meta.url),'utf8'));
test('explicit service and low-price preferences survive formatting and discovery handoff',()=>{
  for(const [text,priority] of [['偏好售後好','after_sales_first'],['偏好價格低','price_first']]) {
    const formatted=formatIntent({intent_md:`我想買無線滑鼠，預算1000元，7天內到貨，${text}`});
    assert.equal(formatted.status,'ready');
    assert.deepEqual(toDiscoveryQuery(formatted.normalized_intent!).priorities,[priority]);
  }
  assert.equal(formatIntent({intent_md:'我想買無線滑鼠，預算1000元，7天內到貨，保固必須三年'}).status,'needs_clarification');
});
test('existing Formatter DB survives the later Result table rebuild with replay and immutability intact',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    for(const version of ['001_initial','002_discovery','002_five_seller_negotiation','003_orchestrator_handoff','004_formatter']) {
      db.exec('PRAGMA foreign_keys=OFF');
      db.exec(readFileSync(new URL(`../db/migrations/${version}.sql`,import.meta.url),'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(version,'2026-09-12T02:00:00Z');
    }
    db.exec('PRAGMA foreign_keys=ON');
    db.exec("INSERT INTO users VALUES ('user_demo_001','Demo','2026-09-12T02:00:00Z','2026-09-12T02:00:00Z')");
    const service=createFormatterService({db,userId:'user_demo_001',timeoutMs:100,registrations:[]});
    const input={intent_md:scenarios[0].intent_md,idempotency_key:'migration-replay'};
    const original=service.submit(input);
    const rows=db.prepare('SELECT * FROM formatter_runs').all();
    const request=db.prepare('SELECT normalized_intent_json FROM requests WHERE request_id=?').get(original.request_id);
    applyMigrations(db);applyMigrations(db);
    assert.deepEqual(db.prepare('SELECT * FROM formatter_runs').all(),rows);
    assert.deepEqual(db.prepare('SELECT normalized_intent_json FROM requests WHERE request_id=?').get(original.request_id),request);
    assert.deepEqual(service.submit(input),original);
    assert.throws(()=>db.prepare("UPDATE requests SET intent_md='changed' WHERE request_id=?").run(original.request_id),/immutable/);
    assert.throws(()=>db.exec("UPDATE formatter_runs SET result_json='{}'"),/immutable/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    const versions=readdirSync(new URL('../db/migrations/',import.meta.url)).filter(name=>/^\d+_.+\.sql$/.test(name)).map(name=>name.slice(0,-4)).sort();
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row=>row.version),versions);
  } finally {db.close();}
});
for(const s of scenarios) test(`Formatter: ${s.name}`,()=>{
  const r=formatIntent({intent_md:s.intent_md});assert.equal(r.status,s.status,JSON.stringify(r));
  if(r.status==='ready') {assert.equal(r.target_total_twd,s.target);assert.equal(r.normalized_intent?.max_total_twd,s.max);assert.equal(r.normalized_intent?.delivery_days_max,s.days);}
  else {assert.equal(r.normalized_intent,null);assert.ok(r.questions.length);}
});
test('中文偏好、優先順序、配件與文件優先權',()=>{
  const r=formatIntent({intent_md:scenarios[0].intent_md,preference_md:'偏好白色'});
  const ps=r.normalized_intent!.product_preferences;
  assert.equal(ps.find(p=>p.attribute==='color')?.strength,'required');
  assert.ok(ps.filter(p=>['shape','size_class'].includes(p.attribute)).every(p=>p.strength==='preferred'));
  assert.deepEqual(r.normalized_intent!.preferences,['price_first']);
  assert.equal(r.normalized_intent!.negotiation_policy.bundle_mode,'related_no_extra_cost');
  assert.equal(formatIntent({intent_md:'買滑鼠，最高1000元，7天內到貨，不要配件'}).normalized_intent!.negotiation_policy.bundle_mode,'disabled');
});
test('文字 -> 使用者偏好快照 -> DB Request -> 搜尋 -> RFQ -> 呼叫；重播與所有權隔離',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);const c=seedDiscovery(db);let calls=0;
    db.exec(`INSERT INTO user_preferences VALUES ('saved_color','user_demo_001','color','in','["white"]','preferred',1,NULL,1,'2026-09-12T02:00:00Z','2026-09-12T02:00:00Z')`);
    const handler:SellerHandler=async rfq=>{calls++;return {request_id:rfq.request_id,seller_id:rfq.seller_id,round:1,outcome:'refused',is_final:false,drafts:[],message:'test only'};};
    const options={db,userId:'user_demo_001',timeoutMs:100,now:()=>new Date('2026-09-12T02:00:00Z'),registrations:c.sellers.map(s=>({seller_id:s.seller_id,snapshot_id:c.snapshot_id,handle:handler}))};
    const service=createFormatterService(options);
    const input={intent_md:scenarios[0].intent_md,idempotency_key:'text1',snapshot_id:c.snapshot_id};
    const r=service.prepare_from_text(input);
    assert.equal(r.result.status,'ready');assert.equal(r.handoff!.rfqs.length,5);assert.equal(calls,0);
    assert.ok(r.result.normalized_intent!.product_preferences.some(p=>p.attribute==='color'&&p.operator==='in'&&p.values.includes('black')));
    await service.dispatch_first_round({handoff_id:r.handoff!.handoff_id});assert.equal(calls,5);
    db.exec("UPDATE user_preferences SET values_json='[\"red\"]'");
    assert.deepEqual(service.prepare_from_text(input),r);
    await service.dispatch_first_round({handoff_id:r.handoff!.handoff_id});assert.equal(calls,5);
    assert.throws(()=>service.submit({...input,intent_md:'不同輸入'}),/idempotency_conflict/);
    assert.throws(()=>db.prepare("UPDATE requests SET normalized_intent_json='null' WHERE request_id=?").run(r.request_id),/immutable/);
    const inherited=service.submit({intent_md:'買滑鼠，最高1000元，7天內到貨',idempotency_key:'inherited'});
    assert.ok(inherited.result.normalized_intent!.product_preferences.some(p=>p.operator==='in'&&p.values.includes('red')));
    db.exec("UPDATE user_preferences SET values_json='[123]'");
    const invalidSaved=service.submit({intent_md:'買滑鼠，最高1000元，7天內到貨',idempotency_key:'invalid-saved'});
    assert.equal(invalidSaved.result.status,'needs_clarification');
    db.exec("UPDATE user_preferences SET active=0");
    const unclear=service.prepare_from_text({intent_md:'買800左右滑鼠',idempotency_key:'unclear',snapshot_id:c.snapshot_id});
    assert.equal(unclear.handoff,null);assert.equal(calls,5);
    assert.equal(db.prepare('SELECT status FROM requests WHERE request_id=?').get(unclear.request_id)?.status,'needs_clarification');
    const other=createFormatterService({...options,userId:'missing_user'});
    assert.throws(()=>other.submit(input),/not_found/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});
