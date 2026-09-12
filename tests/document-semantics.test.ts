import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {initializeDatabase} from '../scripts/db.mjs';
import {createFormatterService} from '../src/formatter/service.ts';

const fixture=JSON.parse(readFileSync(new URL('../contracts/fixtures/document-semantics.json',import.meta.url),'utf8'));
test('document scopes: temporary overrides and empty snapshots never mutate durable preferences',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);
    db.prepare('INSERT INTO user_preferences VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('long_term_color','user_demo_001','color','in',JSON.stringify([fixture.saved_color]),'preferred',1,null,1,'2026-09-12T00:00:00Z','2026-09-12T00:00:00Z');
    const before=db.prepare('SELECT * FROM user_preferences ORDER BY preference_id').all();
    const service=createFormatterService({db,userId:'user_demo_001',registrations:[],timeoutMs:100});
    for(const c of fixture.cases){
      const input={intent_md:c.intent_md,...(Object.hasOwn(c,'preference_md')?{preference_md:c.preference_md}:{}),idempotency_key:c.id};
      const submission=service.submit(input),result=submission.result;
      assert.equal(result.status,c.expected.status,c.id);
      if(result.status==='ready') {
        const intent=result.normalized_intent!;
        const color=intent.product_preferences.find(p=>p.attribute==='color');
        assert.ok(color&&color.operator==='in'&&color.values.includes(c.expected.color),c.id);
        assert.equal(intent.max_total_twd,c.expected.max,c.id);assert.equal(result.target_total_twd,c.expected.target,c.id);
        if(c.expected.priorities)assert.deepEqual(intent.preferences,c.expected.priorities,c.id);
        if(c.expected.size)assert.ok(intent.product_preferences.some(p=>p.attribute==='size_class'&&p.operator==='in'&&p.strength==='preferred'&&p.values.includes(c.expected.size)),c.id);
      } else {assert.equal(result.normalized_intent,null);assert.ok(result.questions.length);}
      const row=db.prepare('SELECT * FROM requests WHERE request_id=?').get(submission.request_id)!;
      assert.equal(row.intent_md,c.intent_md);assert.equal(row.preference_md,c.preference_md??'');
      assert.deepEqual(db.prepare('SELECT * FROM user_preferences ORDER BY preference_id').all(),before,c.id);
      assert.deepEqual(service.submit(input),submission);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM negotiation_runs').get()?.n,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});
