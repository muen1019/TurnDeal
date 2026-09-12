import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDrafts, matches, advanceOffers, activeOffers, pruneUnavailable, buildContext, competitiveTerms } from '../src/negotiation/validation.mjs';
import { fixture, quote, proposal, NOW } from './helpers/negotiation.mjs';

function scenario(sellerId = 'seller_a') {
  const f = fixture(sellerId);
  const mouse = f.seller.products.find(p => p.product_id === f.rfq.candidate_product_ids[0]);
  const draft = quote(mouse);
  let id = 0;
  return { ...f, draft, validate: drafts => validateDrafts({ result: proposal(f.seller, drafts), rfq: f.rfq,
    intent: f.intent, seller: f.seller, terms: f.terms, now: NOW, idFactory: () => `unit_offer_${++id}` }) };
}

test('categorical and range matching requires an actual known attribute', () => {
  const p = { attributes: { color: 'black', length_mm: 100 } };
  assert.equal(matches(p, { attribute: 'color', operator: 'in', values: ['black'] }), true);
  assert.equal(matches(p, { attribute: 'color', operator: 'not_in', values: ['black'] }), false);
  assert.equal(matches(p, { attribute: 'missing', operator: 'not_in', values: ['black'] }), false);
  for (const [min, max, expected] of [[100, 100, true], [101, null, false], [null, 99, false], [null, null, true]])
    assert.equal(matches(p, { attribute: 'length_mm', operator: 'range', min, max }), expected);
});

test('hard constraints reject actual bad proposals, independent of Seller claims', () => {
  for (const [mutate, reason] of [
    [s => { s.draft.total_price_twd = 1001; }, 'over_budget'],
    [s => { s.draft.total_price_twd = 1; }, 'invalid_offer'],
    [s => { s.draft.delivery_days = 8; }, 'delivery_too_late'],
    [s => { s.draft.delivery_days = 1; }, 'invalid_offer'],
    [s => { s.draft.primary_features = ['wired']; }, 'missing_feature'],
    [s => { s.draft.terms_id = 'fictional_terms'; }, 'terms_changed'],
    [s => { s.draft.expires_at = new Date(NOW).toISOString(); }, 'expired'],
    [s => { s.seller.products[0].stock = 0; }, 'invalid_offer'],
    [s => { s.draft.items[0].product_id = 'foreign_sku'; }, 'invalid_offer'],
    [s => { s.seller.products[0].attributes.color = 'white'; }, 'invalid_offer'],
  ]) {
    const s = scenario(); mutate(s);
    const [offer] = s.validate([s.draft]);
    assert.equal(offer.eligibility.status, 'rejected');
    assert.ok(offer.eligibility.reason_codes.includes(reason), `${reason}: ${offer.eligibility.reason_codes}`);
  }
});

test('duplicate references, duplicate variants, excess quantity and invented authority fail closed', () => {
  for (const make of [s => [s.draft, s.draft], s => [{ ...s.draft, eligible: true }],
    s => [{ ...s.draft, items: [{ ...s.draft.items[0], quantity: 2 }] }]]) {
    const s = scenario(); assert.throws(() => s.validate(make(s)));
  }
});

function bundleScenario(increment = 0) {
  const s = scenario('seller_c');
  const pad = s.seller.products.find(p => p.category === 'mouse_pad');
  s.bundle = { ...structuredClone(s.draft), draft_ref: 'bundle', baseline_draft_ref: s.draft.draft_ref, variant: 'bundle', optional_addons: true,
    items: [...structuredClone(s.draft.items), { product_id: pad.product_id, category: 'mouse_pad', role: 'addon', quantity: 1 }],
    total_price_twd: s.draft.total_price_twd + increment };
  return s;
}

test('same-price gifts and cheaper bundles are eligible; paid add-ons require explicit cap', () => {
  for (const [increment, cap, status] of [[0, 0, 'eligible'], [-30, 0, 'eligible'], [30, 0, 'needs_confirmation'], [30, 30, 'eligible'], [31, 30, 'needs_confirmation']]) {
    const s = bundleScenario(increment);
    if (cap) s.intent.negotiation_policy = { bundle_mode: 'related_with_cap', max_addon_increment_twd: cap, allowed_addon_categories: ['mouse_pad'] };
    const offers = s.validate([s.bundle, s.draft]); // Seller order does not control the baseline resolution.
    assert.equal(offers[1].eligibility.status, status);
    assert.equal(offers[1].baseline_offer_id, offers[0].offer_id);
  }
});

test('bundle cannot remove return terms, slow delivery or force the gift', () => {
  for (const [mutate, reason] of [
    [s => { s.bundle.delivery_days = 4; }, 'terms_changed'],
    [s => { s.bundle.terms_id = 'changed'; }, 'terms_changed'],
  ]) {
    const s = bundleScenario(); mutate(s);
    assert.ok(s.validate([s.draft, s.bundle])[1].eligibility.reason_codes.includes(reason));
  }
  const s = bundleScenario(); s.bundle.optional_addons = false;
  assert.throws(() => s.validate([s.draft, s.bundle]));
});

test('new baseline invalidates previous bundle, rejected replacements preserve valid history', () => {
  const s = bundleScenario(); const old = s.validate([s.draft, s.bundle]); const latest = new Map();
  advanceOffers(latest, old);
  const rejected = { ...old[0], offer_id: 'bad', eligibility: { status: 'rejected', reason_codes: ['over_budget'] } };
  advanceOffers(latest, [rejected]); assert.equal(activeOffers(latest, NOW).length, 2);
  advanceOffers(latest, [{ ...old[0], offer_id: 'new', total_price_twd: 650 }]);
  assert.deepEqual(activeOffers(latest, NOW).map(o => o.offer_id), ['new']);
});

test('pruned expired offers cannot revive when clock or inventory changes', () => {
  const s = scenario(); const [offer] = s.validate([s.draft]); const latest = new Map(); advanceOffers(latest, [offer]);
  pruneUnavailable(latest, s.catalog, s.catalog, s.intent, Date.parse(offer.expires_at));
  pruneUnavailable(latest, s.catalog, s.catalog, s.intent, NOW);
  assert.equal(latest.size, 0);
});

test('context publishes whole real eligible offers and strips competitor identity in RFQs', () => {
  const a = scenario(); const b = scenario('seller_b');
  const offers = [...a.validate([a.draft]), ...b.validate([b.draft]).map(o => ({ ...o, offer_id: 'b_offer' }))];
  const context = buildContext({ requestId: 'unit_req', revision: 1, round: 1, offers, catalog: a.catalog, intent: a.intent, now: NOW });
  const terms = competitiveTerms(context, b.seller, b.rfq.candidate_product_ids, NOW);
  assert.equal(terms.length, 1);
  assert.equal(terms[0].total_price_twd, 599); assert.equal(terms[0].delivery_days, 5);
  assert.ok(terms[0].differences.length > 0);
  assert.equal(terms[0].seller_id, undefined); assert.equal(terms[0].offer_id, undefined);
  assert.throws(() => { context.offers[0].total_price_twd = 1; }, TypeError);
});
