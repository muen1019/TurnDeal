import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const schema = read('../contracts/seller-negotiation-policy.v0.1.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile(schema);

export function validateSellerPolicies(policy, catalog) {
  assert.ok(validateShape(policy), ajv.errorsText(validateShape.errors));
  assert.equal(policy.snapshot_id, catalog.snapshot_id, 'snapshot mismatch');
  const sellers = new Set(), listings = new Set();
  for (const seller of policy.sellers) {
    assert.ok(!sellers.has(seller.seller_id), 'duplicate seller');
    sellers.add(seller.seller_id);
    assert.ok(catalog.sellers.some(s => s.seller_id === seller.seller_id), 'unknown seller');
    if (seller.status === 'ready') assert.ok(seller.settings, 'ready needs settings');
    for (const entry of seller.listings) {
      assert.ok(!listings.has(entry.listing_id), 'duplicate listing');
      listings.add(entry.listing_id);
      const item = catalog.listings.find(l => l.listing_id === entry.listing_id);
      assert.ok(item && item.seller_id === seller.seller_id && item.category === 'mouse', 'wrong listing owner/category');
      const t = entry.terms;
      if (seller.status === 'ready') assert.ok(t, 'ready needs all terms');
      if (!t) continue;
      assert.ok(item.price_includes_tax && item.shipping_twd !== null, 'known tax/shipping required');
      assert.ok(t.floor_item_price_twd <= item.item_price_twd, 'floor exceeds price');
      assert.ok(t.round_discount_twd.every((v, i, a) => i === 0 || v >= a[i-1]), 'discounts must be cumulative/nondecreasing');
      assert.ok(t.round_discount_twd[4] <= item.item_price_twd - t.floor_item_price_twd, 'discount below floor');
      if (seller.settings) {
        const finalRound = seller.settings.final_round;
        assert.ok(t.round_discount_twd.slice(finalRound).every(v => v === t.round_discount_twd[finalRound-1]), 'discount after final must remain unchanged');
        for (const start of [t.shipping.waive_from_round, t.delivery.expedite_from_round, t.addon?.from_round]) {
          if (start != null) assert.ok(start <= finalRound, 'benefit starts after final');
        }
      }
      assert.ok(t.delivery.fastest_days <= item.delivery_days, 'invalid fastest delivery');
      if (t.delivery.expedite_from_round === null) {
        assert.equal(t.delivery.fastest_days, item.delivery_days);
        assert.equal(t.delivery.expedite_fee_twd, 0);
      }
      if (t.addon) {
        const addon = catalog.listings.find(l => l.listing_id === t.addon.listing_id);
        assert.ok(addon && addon.seller_id === seller.seller_id && addon.category === 'mouse_pad', 'invalid addon owner/category');
        assert.ok(t.addon.mode === 'free_gift' ? t.addon.buyer_price_twd === 0 : t.addon.buyer_price_twd > 0, 'addon mode/price mismatch');
      }
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policy = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : read('../contracts/fixtures/seller-negotiation-policies.template.json');
  validateSellerPolicies(policy, read('../contracts/fixtures/discovery-catalog.json'));
  console.log(`Seller policy validation passed (${policy.sellers.filter(s => s.status === 'ready').length} ready; draft is NOT negotiation-ready).`);
}
