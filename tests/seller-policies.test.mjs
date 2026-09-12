import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSellerPolicies } from '../scripts/validate-seller-policies.mjs';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const catalog = read('../contracts/fixtures/discovery-catalog.json');
const template = read('../contracts/fixtures/seller-negotiation-policies.template.json');
function ready() {
  const p = structuredClone(template);
  p.sellers = [p.sellers[0]];
  const s = p.sellers[0];
  s.status = 'ready';
  s.settings = { strategy: 'balanced', max_rounds: 5, final_round: 2, timeout_ms: 3000, quote_ttl_seconds: 300, buyer_below_floor: 'counter_at_floor', after_last_round: 'stop' };
  s.listings = [{ listing_id: 'listing_002', terms: {
    floor_item_price_twd: 649, round_discount_twd: [20,60,60,60,60],
    shipping: { waive_from_round: 2, min_item_subtotal_twd: 600 },
    delivery: { fastest_days: 1, expedite_from_round: null, expedite_fee_twd: 0 },
    addon: { listing_id: 'listing_007', mode: 'free_gift', buyer_price_twd: 0, from_round: 2, min_item_subtotal_twd: 600 }
  }}];
  return p;
}
test('draft template covers all 15 sellers and 90 primary listings without enabling policies', () => {
  assert.ok(validateSellerPolicies(template, catalog));
  assert.equal(template.sellers.length, 15);
  assert.deepEqual(template.sellers.flatMap(s => s.listings.map(l => l.listing_id)).sort(), catalog.listings.filter(l => l.category === 'mouse').map(l => l.listing_id).sort());
  assert.ok(template.sellers.every(s => s.status === 'draft' && s.settings === null && s.listings.every(l => l.terms === null)));
});
test('documented ready example validates', () => assert.ok(validateSellerPolicies(ready(), catalog)));
test('invalid and incomplete policies are rejected', () => {
  const changes = [
    p => p.snapshot_id = 'wrong',
    p => p.sellers[0].settings = null,
    p => p.sellers[0].listings[0].terms = null,
    p => p.sellers[0].settings.max_rounds = 10,
    p => p.sellers[0].settings.final_round = 0,
    p => p.sellers[0].settings.final_round = 1,
    p => p.sellers[0].settings.timeout_ms = 60001,
    p => p.sellers[0].settings.unknown = true,
    p => p.sellers.push(structuredClone(p.sellers[0])),
    p => p.sellers[0].listings[0].listing_id = 'listing_010',
    p => p.sellers[0].listings[0].terms.floor_item_price_twd = 800,
    p => p.sellers[0].listings[0].terms.round_discount_twd = [60,20,60,60,60],
    p => p.sellers[0].listings[0].terms.round_discount_twd = [20,60,60,60,61],
    p => p.sellers[0].listings[0].terms.addon.listing_id = 'listing_015',
    p => p.sellers[0].listings[0].terms.addon.buyer_price_twd = 1,
    p => p.sellers[0].listings[0].terms.delivery.expedite_fee_twd = 10
  ];
  for (const change of changes) {
    const p = ready(); change(p);
    assert.throws(() => validateSellerPolicies(p, catalog));
  }
});
