import test from 'node:test';
import assert from 'node:assert/strict';
import { BuyerAgent, SellerAgent } from '../src/negotiation/agents.mjs';
import { LimitReached } from '../src/negotiation/model.mjs';
import { fixture, invocation, unavailableModel, modelReturning, NOW } from './helpers/negotiation.mjs';
import { readFileSync } from 'node:fs';

test('Seller fallback follows all five independent private policies', async () => {
  for (const [id, price, days, count, final] of [
    ['seller_a', 599, 5, 1, false], ['seller_b', 769, 1, 1, false],
    ['seller_c', 669, 3, 2, false], ['seller_d', 679, 2, 1, false], ['seller_e', 679, 4, 1, true],
  ]) {
    const { seller, rfq } = fixture(id);
    const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq });
    assert.equal(answer.provider, 'deterministic');
    assert.equal(answer.result.drafts.length, count);
    assert.equal(answer.result.drafts[0].total_price_twd, price);
    assert.equal(answer.result.drafts[0].delivery_days, days);
    assert.equal(answer.result.is_final, final);
  }
});

test('Seller clamps aggressive targets to its floor and never raises its previous price', async () => {
  const { seller, rfq } = fixture();
  const agent = new SellerAgent(seller, unavailableModel);
  rfq.round = 2; rfq.target_total_twd = 1;
  const low = await agent.negotiate({ ...invocation(), rfq });
  assert.equal(low.result.drafts[0].total_price_twd, 540);
  rfq.round = 3; rfq.target_total_twd = 999;
  const next = await agent.negotiate({ ...invocation(), rfq, previous: [low.result.drafts[0]] });
  assert.equal(next.result.drafts[0].total_price_twd, 540);
});

test('firm-price policy constrains the real model as well as fallback', async () => {
  const { seller, rfq } = fixture('seller_e');
  const model = modelReturning({ outcome: 'offered', product_id: rfq.candidate_product_ids[0],
    total_price_twd: 650, include_bundle: false, is_final: true, message: 'Discount' });
  const answer = await new SellerAgent(seller, model).negotiate({ ...invocation(), rfq });
  assert.equal(answer.result.drafts[0].total_price_twd, 679);
  assert.equal(answer.provider, 'deterministic');
});

test('Seller rejects foreign branch RFQs and refuses zero-stock products', async () => {
  const { seller, rfq } = fixture();
  await assert.rejects(new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq: { ...rfq, seller_id: 'seller_b' } }), /mismatch/);
  seller.products.forEach(p => { p.stock = 0; });
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq });
  assert.equal(answer.result.outcome, 'refused');
  assert.deepEqual(answer.result.drafts, []);
});

test('free gift requires permission, inventory, matching terms and no slower delivery', async () => {
  for (const change of [
    (seller, rfq) => { rfq.allowed_addon_categories = []; },
    seller => { seller.products.find(p => p.category === 'mouse_pad').stock = 0; },
    seller => { seller.products.find(p => p.category === 'mouse_pad').delivery_days = 8; },
    seller => { seller.products.find(p => p.category === 'mouse_pad').terms_id = 'other_terms'; },
  ]) {
    const { seller, rfq } = fixture('seller_c'); change(seller, rfq);
    const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq });
    assert.equal(answer.result.drafts.length, 1);
  }
});

test('Seller model cannot select a foreign SKU, go below floor or create unauthorized gifts', async () => {
  for (const invalid of [{ product_id: 'foreign' }, { total_price_twd: 1 }, { include_bundle: true }, { surprise: true }]) {
    const { seller, rfq } = fixture();
    const answer = await new SellerAgent(seller, modelReturning({ outcome: 'offered', product_id: rfq.candidate_product_ids[0],
      total_price_twd: 599, include_bundle: false, is_final: false, message: 'Quote', ...invalid })).negotiate({ ...invocation(), rfq });
    assert.equal(answer.provider, 'deterministic');
    assert.equal(answer.result.drafts[0].total_price_twd, 599);
  }
});

test('Seller final schedule is enforced even when model wants to continue', async () => {
  const { seller, rfq } = fixture('seller_d'); rfq.round = 3;
  const answer = await new SellerAgent(seller, modelReturning({ outcome: 'offered', product_id: rfq.candidate_product_ids[0],
    total_price_twd: 639, include_bundle: false, is_final: false, message: 'More rounds?' })).negotiate({ ...invocation(), rfq });
  assert.equal(answer.result.is_final, true);
});

test('configured bundle discount reserves the floor and emits a cheaper optional solution', async () => {
  const { seller, rfq } = fixture('seller_d');
  const pad = fixture('seller_c').seller.products.find(p => p.category === 'mouse_pad');
  pad.delivery_days = 2; seller.products.push(pad);
  seller.strategy.bundle_mode = 'free_optional_mouse_pad'; seller.strategy.bundle_discount_twd = 30;
  seller.strategy.always_offer_bundle = true; rfq.round = 2; rfq.target_total_twd = 1;
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq });
  assert.deepEqual(answer.result.drafts.map(d => d.total_price_twd), [630, 600]);
  assert.equal(answer.result.drafts[1].optional_addons, true);
  assert.equal(answer.result.drafts[1].baseline_draft_ref, answer.result.drafts[0].draft_ref);
});

function buyerArgs(round = 1) {
  const { seller, branch, intent } = fixture('seller_b');
  const sharing = JSON.parse(readFileSync(new URL('../contracts/fixtures/negotiation-sharing.json', import.meta.url), 'utf8'));
  return { ...invocation(), requestId: 'req_buyer_unit', round, seller, branch, intent,
    context: round === 1 ? { ...sharing.context, offers: [] } : sharing.context };
}

test('Buyer first-round RFQ omits budget and original preference text', async () => {
  const args = buyerArgs();
  const output = await new BuyerAgent('seller_b', unavailableModel).negotiate(args);
  assert.equal(output.rfq.target_total_twd, null);
  assert.deepEqual(output.rfq.competitive_terms, []);
  assert.equal(output.rfq.max_total_twd, undefined);
  assert.ok(output.rfq.product_preferences.every(p => !('source_text' in p)));
});

test('Buyer target comes from an unexpired competitor standalone; bundles never become standalone targets', async () => {
  const args = buyerArgs(2);
  args.context.offers.find(o => o.variant === 'bundle').total_price_twd = 1;
  const expired = args.context.offers.find(o => o.seller_id === 'seller_a');
  expired.expires_at = new Date(NOW).toISOString();
  const answer = await new BuyerAgent('seller_b', unavailableModel).negotiate(args);
  const targets = args.context.offers.filter(o => o.seller_id !== 'seller_b' && o.variant === 'standalone' && Date.parse(o.expires_at) > NOW);
  assert.equal(answer.rfq.target_total_twd, Math.min(...targets.map(o => o.total_price_twd)));
  for (const term of answer.rfq.competitive_terms) { assert.equal(term.seller_id, undefined); assert.equal(term.offer_id, undefined); }
});

test('Buyer cannot invent a target index or stop before any offer', async () => {
  for (const output of [{ action: 'negotiate', target_option_index: 100 }, { action: 'stop', target_option_index: 0 }]) {
    const answer = await new BuyerAgent('seller_b', modelReturning(output)).negotiate(buyerArgs());
    assert.equal(answer.provider, 'deterministic'); assert.equal(answer.stop, false);
  }
});

test('cost limits and parent cancellation propagate instead of falling back', async () => {
  const args = buyerArgs();
  await assert.rejects(new BuyerAgent('seller_b', { decide: async () => { throw new LimitReached('call_budget'); } }).negotiate(args), /call_budget/);
  const controller = new AbortController(); controller.abort(); args.signal = controller.signal;
  await assert.rejects(new BuyerAgent('seller_b', unavailableModel).negotiate(args), { name: 'AbortError' });
});
