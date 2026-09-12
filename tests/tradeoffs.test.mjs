import test from 'node:test';
import assert from 'node:assert/strict';
import { SellerAgent, BuyerAgent } from '../src/negotiation/agents.mjs';
import { validateDrafts } from '../src/negotiation/validation.mjs';
import { fixture, invocation, unavailableModel, NOW } from './helpers/negotiation.mjs';
import { ModelGateway } from '../src/negotiation/model.mjs';

function setup() {
  const f = fixture('seller_c');
  f.seller.strategy.gift_exchange_discount_twd = 30;
  return { ...f, agent: new SellerAgent(f.seller, unavailableModel) };
}
function validate(f, result, rfq, previous = [], history = []) {
  let n = 0;
  return validateDrafts({ ...f, result, rfq, previous, history, now: NOW, idFactory: () => `trade_${rfq.round}_${++n}` });
}

test('a buyer can exchange a validated gift for up to 30 TWD; the dearer bundle requires consent', async () => {
  const f = setup();
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  const previous = validate(f, first.result, f.rfq);
  const rfq = { ...f.rfq, round: 2, previous_offer_ids: previous.map(o => o.offer_id),
    proposal: { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 600,
      reference_offer_id: previous.find(o => o.variant === 'bundle').offer_id } };
  const answer = await f.agent.negotiate({ ...invocation(), rfq, previous });
  assert.deepEqual(answer.result.drafts.map(d => d.total_price_twd), [629, 659]);
  assert.equal(answer.result.proposal_response.status, 'countered');
  assert.equal(answer.result.proposal_response.exchange_discount_twd, 30);
  const offers = validate(f, answer.result, rfq, previous);
  assert.equal(offers[0].eligibility.status, 'eligible');
  assert.equal(offers[1].eligibility.status, 'needs_confirmation');
  assert.equal(offers[1].eligibility.reason_codes[0], 'addon_consent_required');
});

test('Backend rejects a Seller adapter that falsely claims an accepted gift exchange', async () => {
  const f = setup();
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  const previous = validate(f, first.result, f.rfq);
  const rfq = { ...f.rfq, round: 2, previous_offer_ids: previous.map(o => o.offer_id),
    proposal: { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 600, reference_offer_id: previous[1].offer_id } };
  const answer = await f.agent.negotiate({ ...invocation(), rfq, previous });
  answer.result.proposal_response.status = 'accepted';
  assert.throws(() => validate(f, answer.result, rfq, previous), /proposal_response/);
});

test('Buyer can make its own conditional bid without inventing a competitor quote', async () => {
  const f = setup();
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  const previous = validate(f, first.result, f.rfq);
  const proposal = { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 600,
    reference_offer_id: previous[1].offer_id };
  const gateway = new ModelGateway({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ action: 'negotiate', target_option_index: 0, proposal }) }] }],
  }) }) });
  const answer = await new BuyerAgent('seller_c', gateway).negotiate({ ...invocation(), ...f,
    requestId: f.rfq.request_id, round: 2, previous, context: { offers: [] } });
  assert.equal(answer.provider, 'openai');
  assert.deepEqual(answer.rfq.proposal, proposal);
  assert.equal(answer.rfq.target_total_twd, null);
  assert.deepEqual(answer.rfq.competitive_terms, []);
  assert.equal(answer.rfq.max_total_twd, undefined);
});

test('Buyer can explicitly ask for a registered return extension instead of a price cut', async () => {
  const f = setup();
  const proposal = { kind: 'request_benefit', variant: 'standalone', target_total_twd: null,
    reference_offer_id: null, benefit_kind: 'return_extension' };
  const gateway = new ModelGateway({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ action: 'negotiate', target_option_index: 0, proposal }) }] }],
  }) }) });
  const answer = await new BuyerAgent('seller_c', gateway).negotiate({ ...invocation(), ...f,
    seller: { ...f.seller, public_benefit_kinds: ['return_extension'] }, requestId: f.rfq.request_id, round: 1, context: { offers: [] } });
  assert.equal(answer.provider, 'openai');
  assert.deepEqual(answer.rfq.proposal, proposal);
});

test('gift exchange cannot be stacked; explicit paid-addon consent changes eligibility only', async () => {
  const f = setup();
  f.intent.negotiation_policy = { bundle_mode: 'related_with_cap', allowed_addon_categories: ['mouse_pad'], max_addon_increment_twd: 30 };
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  let previous = validate(f, first.result, f.rfq);
  let rfq = { ...f.rfq, round: 2, previous_offer_ids: previous.map(o => o.offer_id),
    proposal: { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 600, reference_offer_id: previous[1].offer_id } };
  const second = await f.agent.negotiate({ ...invocation(), rfq, previous });
  previous = validate(f, second.result, rfq, previous);
  assert.equal(previous[1].eligibility.status, 'eligible');
  rfq = { ...rfq, round: 3, previous_offer_ids: previous.map(o => o.offer_id), proposal: { ...rfq.proposal, reference_offer_id: previous[1].offer_id } };
  const next = await f.agent.negotiate({ ...invocation(), rfq, previous,
    history: [{ result: { proposal_response: second.result.proposal_response } }] });
  assert.equal(next.result.drafts[0].total_price_twd,629);
  assert.equal(next.result.proposal_response.exchange_discount_twd,0);
  assert.equal(next.result.proposal_response.status,'declined');
  assert.equal(next.result.outcome,'offered');
});

test('gift exchange refuses foreign or expired references and cannot breach the product floor', async () => {
  const f = setup();
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  const previous = validate(f, first.result, f.rfq);
  const rfq = { ...f.rfq, round: 2, previous_offer_ids: previous.map(o => o.offer_id),
    proposal: { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 1, reference_offer_id: previous[1].offer_id } };
  for (const mutation of [o => { o.seller_id = 'seller_a'; }, o => { o.expires_at = new Date(NOW).toISOString(); }]) {
    const bad = structuredClone(previous); mutation(bad[1]);
    await assert.rejects(f.agent.negotiate({ ...invocation(), rfq, previous: bad }), /invalid_proposal_reference/);
  }
  f.seller.products.find(p => p.category === 'mouse').floor_price_twd = 645;
  const answer = await new SellerAgent(f.seller, unavailableModel).negotiate({ ...invocation(), rfq, previous });
  assert.equal(answer.result.drafts[0].total_price_twd,645);
  assert.equal(answer.result.proposal_response.exchange_discount_twd,14);
});

test('no gift inventory or no cash-exchange policy declines the condition while preserving a quote', async () => {
  for (const change of [f => { f.seller.strategy.gift_exchange_discount_twd = 0; },
    f => { f.seller.products.find(p => p.category === 'mouse_pad').stock = 0; }]) {
    const f = setup();
    const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
    const previous = validate(f, first.result, f.rfq); change(f);
    const rfq = { ...f.rfq, round: 2, previous_offer_ids: previous.map(o => o.offer_id),
      proposal: { kind: 'exchange_gift', variant: 'standalone', target_total_twd: 600, reference_offer_id: previous[1].offer_id } };
    const answer = await new SellerAgent(f.seller, unavailableModel).negotiate({ ...invocation(), rfq, previous });
    assert.equal(answer.result.proposal_response.exchange_discount_twd,0);
    assert.equal(answer.result.proposal_response.status,'declined');
    assert.equal(answer.result.outcome,'offered');
  }
});

test('Buyer cannot stop after the opening quote before trying a useful counterproposal', async () => {
  const f = setup();
  const first = await f.agent.negotiate({ ...invocation(), rfq: f.rfq });
  const previous = validate(f, first.result, f.rfq);
  const gateway = new ModelGateway({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ action: 'stop', target_option_index: 0, proposal: null }) }] }],
  }) }) });
  const answer = await new BuyerAgent('seller_c', gateway).negotiate({ ...invocation(), ...f,
    requestId: f.rfq.request_id, round: 2, previous, context: { offers: [] } });
  assert.equal(answer.stop,false);
  assert.equal(answer.provider,'deterministic');
  assert.equal(answer.rfq.proposal.kind,'exchange_gift');
});
