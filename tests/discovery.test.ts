import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { rankCandidates, ratingScore, createDiscoveryService } from '../src/orchestrator/discovery.ts';
import type { Catalog } from '../src/orchestrator/discovery.ts';
const fixture = (): Catalog => JSON.parse(readFileSync(new URL('../contracts/fixtures/discovery-catalog.json', import.meta.url), 'utf8'));
const now = '2026-09-12T10:00:00+08:00';
const query = { category: 'mouse' as const, target_total_twd: 800 };

test('optional target price: renormalized weights and price-independent ranking', () => {
  for (const preferred_attributes of [undefined, { color: 'black' }]) {
    const c = fixture();
    const q = { category: 'mouse' as const, preferred_attributes };
    const r = rankCandidates(c, q, now);
    assert.equal(r.candidates.length, 5);
    assert.equal(r.weights.price, 0);
    assert.ok(Math.abs(Object.values(r.weights).reduce((a,b)=>a+b,0)-1)<1e-12);
    assert.ok(Math.abs(r.weights.product_rating - (preferred_attributes ? .15/.55 : .5))<1e-12);
    assert.ok(r.candidates.every(x=>x.price_difference_twd===null && Number.isFinite(x.score)));
    c.listings.forEach(x=>x.item_price_twd*=10);
    const changed = rankCandidates(c,q,now);
    assert.deepEqual(changed.candidates.map(x=>[x.listing.listing_id,x.score]),r.candidates.map(x=>[x.listing.listing_id,x.score]));
    assert.ok(!JSON.stringify(r).includes('undefined'));
  }
  const capped = rankCandidates(fixture(), { category:'mouse', max_total_twd: 1 }, now);
  assert.ok(capped.candidates.every(x=>x.candidate_status==='alternative_requires_confirmation'));
  for (const target of [null, 0, -1, '800', NaN]) {
    assert.throws(()=>rankCandidates(fixture(), { ...query, target_total_twd: target as number }, now), /invalid_argument/);
  }
});

test('120 listings: stable five distinct available sellers, independent of ads and input order', () => {
  const c = fixture(); assert.equal(c.listings.length,120); assert.equal(c.sellers.length,15);
  const a = rankCandidates(c,query,now);
  assert.equal(a.candidates.length,5); assert.equal(new Set(a.candidates.map(x=>x.seller.seller_id)).size,5);
  assert.ok(a.candidates.every(x=>x.listing.stock>0 && x.listing.category==='mouse' && x.candidate_status==='qualified'));
  assert.ok(a.candidates.every(x=>!x.negotiation_ready));
  c.campaigns.forEach(x=>x.bid_twd*=10000); c.listings.reverse(); c.sellers.reverse();
  assert.deepEqual(rankCandidates(c,query,now).candidates,a.candidates);
  assert.ok(ratingScore(4.8,500)>ratingScore(5,1));
});
test('price is soft; alternatives fill five without treating violated requirements as qualified', () => {
  const c = fixture();
  const far = rankCandidates(c,{...query,target_total_twd:50},now);
  assert.equal(far.candidates.length,5);
  const hard = rankCandidates(c,{...query,required_attributes:{color:'purple'}},now);
  assert.equal(hard.candidates.length,5);
  assert.ok(hard.candidates.every(x=>x.candidate_status==='alternative_requires_confirmation' && !x.negotiation_ready));
  assert.equal(hard.sponsored_placement,null);
  c.sellers.slice(2).forEach(x=>x.enabled=false);
  assert.equal(rankCandidates(c,query,now).shortage_reason,'fewer_than_five_distinct_available_sellers');
  assert.throws(()=>rankCandidates(c,{...query,target_total_twd:0},now),/invalid_argument/);
});
test('shipping affects score, missing totals are explicit and scores add up', () => {
  const c = fixture(); c.listings[0].stock=5; c.listings[0].item_price_twd=800; c.listings[0].shipping_twd=60;
  const r=rankCandidates(c,{...query,preferred_attributes:{color:'black'}},now);
  for(const x of r.candidates) {
    const sum=Object.entries(r.weights).reduce((s,[k,w])=>s+x.scores[k as keyof typeof x.scores]*w,0);
    assert.ok(Math.abs(sum-x.score)<.0001);
  }
  c.listings.forEach(x=>x.shipping_twd=null);
  const unknown=rankCandidates(c,query,now);
  assert.ok(unknown.candidates.every(x=>x.total_price_twd===null && x.scores.price===0 && !x.negotiation_ready));
});
test('additive SQLite seed is repeatable, persists runs and preserves old records', () => {
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db); seedDiscovery(db); seedDiscovery(db);
    assert.equal(db.prepare('SELECT count(*) n FROM discovery_catalogs').get()?.n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM offers').get()?.n,6);
    const service=createDiscoveryService({db,userId:'user_demo_001',registeredSellerIds:[]});
    const r=service.discover_candidates({query,snapshot_id:'discovery_demo_v02',now});
    const saved=db.prepare('SELECT result_json FROM discovery_runs WHERE run_id=?').get(r.run_id);
    assert.deepEqual(JSON.parse(String(saved?.result_json)).candidates,r.candidates);
    const noPrice = service.discover_candidates({query:{category:'mouse'},snapshot_id:'discovery_demo_v02',now});
    assert.equal(noPrice.candidates.length,5);
    const stored = db.prepare('SELECT input_json, policy_version FROM discovery_runs WHERE run_id=?').get(noPrice.run_id);
    assert.deepEqual(JSON.parse(String(stored?.input_json)),{category:'mouse'});
    assert.equal(stored?.policy_version,'discovery-score-v0.4');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.throws(()=>db.exec("UPDATE discovery_runs SET result_json='{}'"),/immutable/);
  } finally {db.close();}
});
