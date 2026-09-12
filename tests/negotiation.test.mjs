import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeDatabase } from '../scripts/db.mjs';
import { prepareDemoRequest, demoFixture } from '../scripts/lib/negotiation-demo.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { SellerAgent, BuyerAgent } from '../src/negotiation/agents.mjs';
import { validateSellerList } from '../scripts/lib/contract-validation.mjs';
import { check } from '../src/negotiation/contracts.mjs';

const fixedNow = Date.parse('2026-09-12T05:00:00Z');
function setup(t, { intent, count = 5 } = {}) {
  const db = new DatabaseSync(':memory:');
  initializeDatabase(db);
  t.after(() => db.close());
  const input = prepareDemoRequest(db, { requestId: 'test_negotiation', intent });
  input.orchestration.seller_agents = input.orchestration.seller_agents.slice(0, count);
  input.orchestration.sponsored_placement = null;
  const repository = new NegotiationRepository(db);
  let id = 0;
  return { db, repository, input, run: overrides => negotiate({ ...input, repository,
    now: () => fixedNow, idFactory: () => `offer_test_${++id}`, ...overrides }) };
}

function sellerOverride(transform) {
  return (seller, gateway) => {
    const agent = new SellerAgent(seller, gateway);
    return { negotiate: async args => transform(await agent.negotiate(args), args, seller) };
  };
}

test('five independent pairs share prior-round validated context, finish early, and freeze six offers', async t => {
  const { run, repository, input } = setup(t);
  const result = await run();
  assert.equal(result.status, 'evaluating');
  assert.equal(result.completed_rounds, 5);
  assert.equal(result.offers.length, 6);
  assert.deepEqual([...result.seller_agents].sort((a, b) => a.seller_id.localeCompare(b.seller_id)).map(b => b.rounds.length), [5, 5, 5, 3, 1]);
  validateSellerList(result.seller_agents);
  const history = repository.history(input.requestId, input.buyerId);
  assert.equal(history.length, 6);
  assert.equal(history[0].context.offers.length, 0);
  for (const state of history) check('SharedNegotiationContext', state.context);
  const final = history.at(-1);
  assert.equal(final.offers.length, 24);
  for (const trace of final.traces) {
    assert.equal(trace.context_revision, trace.round - 1);
    check('SellerRFQ', trace.rfq);
    if (trace.round === 1) assert.deepEqual(trace.rfq.competitive_terms, []);
    const serialized = JSON.stringify(trace.rfq);
    for (const secret of ['floor_price', 'campaign', 'trust', 'source_text', 'max_total_twd']) assert.ok(!serialized.includes(secret));
    for (const term of trace.rfq.competitive_terms) {
      assert.equal(term.seller_id, undefined);
      assert.equal(term.offer_id, undefined);
      assert.ok(history[trace.round - 1].context.offers.some(o => o.seller_id !== trace.seller_id &&
        o.total_price_twd === term.total_price_twd && o.delivery_days === term.delivery_days && o.expires_at === term.expires_at));
    }
  }
  const price = id => result.offers.find(o => o.seller_id === id && o.variant === 'standalone').total_price_twd;
  assert.ok(price('seller_a') < price('seller_c') && price('seller_c') < price('seller_b'));
  assert.equal(result.offers.find(o => o.seller_id === 'seller_b').delivery_days, 1);
  const bundle = result.offers.find(o => o.variant === 'bundle');
  assert.equal(bundle.total_price_twd, price('seller_c'));
  assert.ok(result.offers.some(o => o.offer_id === bundle.baseline_offer_id));
  assert.throws(() => { result.offers[0].total_price_twd = 1; }, TypeError);
});

test('offline runs reproduce prices, history, IDs and stopping', async t => {
  const a = setup(t); const b = setup(t);
  assert.deepEqual(await a.run(), await b.run());
  assert.deepEqual(a.repository.history(a.input.requestId, a.input.buyerId), b.repository.history(b.input.requestId, b.input.buyerId));
});

test('accepts fewer/zero sellers and rejects duplicates or foreign candidates', async t => {
  const empty = setup(t, { count: 0 });
  assert.equal((await empty.run()).status, 'no_match');
  const one = setup(t, { count: 1 });
  assert.equal((await one.run()).seller_agents.length, 1);
  const duplicate = setup(t);
  duplicate.input.orchestration.seller_agents[1].seller_id = 'seller_a';
  await assert.rejects(duplicate.run(), /invalid_selected_branches/);
  const foreign = setup(t);
  foreign.input.orchestration.seller_agents[0].candidate_products[0].product_id = 'mouse_b_black_small';
  await assert.rejects(foreign.run(), /invalid_candidate_ownership/);
});

test('timed-out branch preserves last offer; late responses cannot alter barrier history', async t => {
  const { run, repository, input } = setup(t);
  const result = await run({ options: { round_timeout_ms: 15 }, sellerFactory: sellerOverride(async (result, args, seller) => {
    if (seller.seller_id === 'seller_a' && args.rfq.round === 2) await delay(60);
    return result;
  }) });
  const a = result.seller_agents.find(b => b.seller_id === 'seller_a');
  assert.equal(a.stop_reason, 'timeout');
  assert.equal(a.rounds.length, 2);
  assert.equal(result.offers.find(o => o.seller_id === 'seller_a').round, 1);
  const before = repository.history(input.requestId, input.buyerId);
  await delay(80);
  assert.deepEqual(repository.history(input.requestId, input.buyerId), before);
  assert.equal(result.seller_agents.find(s => s.seller_id === 'seller_b').rounds.length, 5);
});

test('refusal, malformed output and spoofed identity isolate the branch and preserve valid offers', async t => {
  const { run } = setup(t);
  const result = await run({ sellerFactory: sellerOverride((response, args, seller) => {
    if (args.rfq.round !== 2) return response;
    if (seller.seller_id === 'seller_a') response.result = { ...response.result, outcome: 'refused', is_final: false, drafts: [],
      proposal_response: { status: 'declined', exchange_discount_twd: 0 } };
    if (seller.seller_id === 'seller_b') response.result.drafts[0].eligible = true;
    if (seller.seller_id === 'seller_c') response.result.seller_id = 'seller_a';
    return response;
  }) });
  assert.deepEqual(['seller_a', 'seller_b', 'seller_c'].map(id => result.seller_agents.find(s => s.seller_id === id).stop_reason), ['refused', 'error', 'error']);
  assert.ok(result.offers.filter(o => ['seller_a', 'seller_b', 'seller_c'].includes(o.seller_id)).every(o => o.round === 1));
});

test('invalid new prices do not evict valid prior offers or enter shared context', async t => {
  const { run, repository, input } = setup(t);
  const result = await run({ sellerFactory: sellerOverride((response, args, seller) => {
    if (seller.seller_id === 'seller_a' && args.rfq.round > 1) response.result.drafts[0].total_price_twd = 1;
    return response;
  }) });
  assert.equal(result.offers.find(o => o.seller_id === 'seller_a').round, 1);
  assert.equal(result.seller_agents.find(s => s.seller_id === 'seller_a').stop_reason, 'error');
  assert.ok(repository.history(input.requestId, input.buyerId).at(-1).traces.some(t => t.seller_id === 'seller_a' && t.result?.outcome === 'error'));
  assert.ok(repository.history(input.requestId, input.buyerId).every(s => s.context.offers.every(o => o.total_price_twd > 1)));
});

test('hard budgets, required attributes, stock and missing bundle permission are enforced', async t => {
  const intent = structuredClone(demoFixture.request.normalized_intent);
  intent.max_total_twd = 500;
  assert.equal((await setup(t, { intent }).run()).status, 'no_match');
  const noStock = setup(t);
  noStock.db.exec('UPDATE seller_inventory SET stock = 0');
  assert.equal((await noStock.run()).status, 'no_match');
  const disabled = structuredClone(demoFixture.request.normalized_intent);
  disabled.negotiation_policy = { bundle_mode: 'disabled', allowed_addon_categories: [], max_addon_increment_twd: 0 };
  assert.ok((await setup(t, { intent: disabled }).run()).offers.every(o => o.variant === 'standalone'));
});

test('paid add-on needs confirmation and never becomes a competitive offer', async t => {
  const { run, repository, input } = setup(t);
  // Legacy RFQ adapters still permit ordinary paid quotes for consent validation;
  // conditional exchange proposals have separate, stricter policy checks.
  const result = await run({ buyerFactory: (id, gateway) => ({ negotiate: async args => {
    const answer = await new BuyerAgent(id, gateway).negotiate(args);
    if (answer.rfq) delete answer.rfq.proposal;
    return answer;
  } }), sellerFactory: sellerOverride(response => {
    const bundle = response.result.drafts.find(d => d.variant === 'bundle');
    if (bundle) bundle.total_price_twd += 100;
    return response;
  }) });
  assert.equal(result.confirmation_offer_ids.length, 1);
  const confirmation = result.confirmation_offer_ids[0];
  assert.ok(!result.eligible_offer_ids.includes(confirmation));
  assert.ok(repository.history(input.requestId, input.buyerId).every(s => s.context.offers.every(o => o.variant === 'standalone')));
});

test('a replaced standalone invalidates its old bundle; invalid replacement does not', async t => {
  const { run } = setup(t);
  const result = await run({ sellerFactory: sellerOverride((response, args) => {
    if (args.rfq.round > 1) response.result.drafts = response.result.drafts.filter(d => d.variant !== 'bundle');
    return response;
  }) });
  assert.ok(result.offers.every(o => o.variant === 'standalone'));
});

test('expired offers are removed before freeze', async t => {
  const { run } = setup(t);
  let now = fixedNow;
  const result = await run({ now: () => now, options: { offer_ttl_ms: 10 }, onEvent(event) {
    if (event.type === 'round_committed') now += 11;
  } });
  assert.equal(result.status, 'no_match');
  assert.equal(result.offers.length, 0);
});

test('stock lost during negotiation is excluded before sharing and final freeze', async t => {
  const { run, db, repository, input } = setup(t);
  const result = await run({ onEvent(event) {
    if (event.type === 'seller_round_completed' && event.seller_id === 'seller_e') db.prepare('UPDATE seller_inventory SET stock = 0 WHERE seller_id = ?').run('seller_e');
  } });
  assert.ok(result.offers.every(o => o.seller_id !== 'seller_e'));
  assert.ok(repository.history(input.requestId, input.buyerId).every(s => s.context.offers.every(o => o.seller_id !== 'seller_e')));
});

test('explicit withdrawal removes own offers, never a competitor offer', async t => {
  const { run } = setup(t);
  const result = await run({ sellerFactory: sellerOverride((response, args, seller) => {
    if (seller.seller_id === 'seller_a' && args.rfq.round === 2) response.result = { ...response.result,
      outcome: 'refused', is_final: false, drafts: [], withdrawn_offer_ids: args.previous.map(o => o.offer_id),
      proposal_response: { status: 'declined', exchange_discount_twd: 0 } };
    return response;
  }) });
  assert.ok(result.offers.every(o => o.seller_id !== 'seller_a'));
  const other = setup(t);
  const bad = await other.run({ sellerFactory: sellerOverride((response, args, seller) => {
    if (seller.seller_id === 'seller_b' && args.rfq.round === 2) response.result.withdrawn_offer_ids = ['offer_test_1'];
    return response;
  }) });
  assert.equal(bad.seller_agents.find(s => s.seller_id === 'seller_b').stop_reason, 'error');
  assert.ok(bad.offers.some(o => o.seller_id === 'seller_a'));
});

test('global deadline and Buyer time are bounded', async t => {
  const { run } = setup(t);
  const result = await run({ options: { round_timeout_ms: 100, global_deadline_ms: 10 }, buyerFactory: (id, gateway) => {
    const buyer = new BuyerAgent(id, gateway);
    return { negotiate: async args => { await delay(80); return buyer.negotiate(args); } };
  } });
  assert.equal(result.stop_reason, 'global_deadline');
  assert.equal(result.completed_rounds, 1);
  assert.equal(result.offers.length, 0);
});

function fakeResponses(calls, transform = value => value) {
  return async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    const input = JSON.parse(body.input[0].content);
    const role = body.text.format.name.startsWith('buyer') ? 'buyer' : 'seller';
    calls.push({ role, input, body });
    const value = role === 'buyer' ? { action: 'negotiate', target_option_index: 0 } : {
      outcome: 'offered', product_id: input.price_bounds[0].product_id,
      total_price_twd: input.price_bounds[0].maximum, include_bundle: input.bundle_available,
      is_final: false, message: 'Offer ready.',
    };
    return { ok: true, json: async () => ({ id: 'resp_test', status: 'completed', usage: { total_tokens: 10 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(transform(value, role, input)) }] }] }) };
  };
}

test('real Responses adapter sends both roles, with no cross-seller private data, and records provenance', async t => {
  const { run, repository, input } = setup(t);
  const calls = [];
  const result = await run({ apiKey: 'test-key-not-real', fetchImpl: fakeResponses(calls), options: { max_tokens: 1000000 } });
  assert.equal(calls.length, 38);
  assert.equal(result.usage.calls, 38);
  assert.equal(result.usage.actual_tokens, 380);
  for (const call of calls) {
    const serialized = JSON.stringify(call.input);
    for (const secret of ['trust', 'campaign', 'test-key-not-real']) assert.ok(!serialized.includes(secret));
    if (call.role === 'buyer') assert.ok(!serialized.includes('floor_price'));
    else assert.ok(call.input.products.every(p => call.input.rfq.candidate_product_ids.includes(p.product_id)));
  }
  const trace = repository.history(input.requestId, input.buyerId).at(-1).traces;
  assert.ok(trace.every(t => t.buyer_provider === 'openai' && t.seller_provider === 'openai'));
  assert.ok(!JSON.stringify(trace).includes('test-key-not-real'));
});

test('API errors, invalid structured decisions and requests ignoring abort all use bounded fallback', async t => {
  for (const fetchImpl of [async () => ({ ok: false, status: 429 }), fakeResponses([], (value, role) => role === 'seller' ? { ...value, total_price_twd: 1 } : { ...value, target_option_index: 999 }),
    async () => new Promise(() => {})]) {
    const { run } = setup(t);
    const result = await run({ apiKey: 'test-key', fetchImpl, options: { model_timeout_ms: 5, max_tokens: 1000000 } });
    assert.equal(result.status, 'evaluating');
    assert.equal(result.offers.length, 6);
    assert.ok(result.offers.every(o => o.total_price_twd >= 540));
  }
});

test('call/token limits stop dispatch without extra model calls', async t => {
  for (const config of [{ max_calls: 0 }, { max_tokens: 0 }, { max_calls: 5 }]) {
    const { run } = setup(t);
    const calls = [];
    const result = await run({ apiKey: 'test-key', fetchImpl: fakeResponses(calls), options: config });
    assert.ok(['call_budget', 'token_budget'].includes(result.stop_reason));
    assert.ok(calls.length <= (config.max_calls ?? 0));
  }
});

test('ownership, completed replay, immutable persistence and interrupted restart', async t => {
  const { run, repository, db, input } = setup(t);
  await assert.rejects(run({ buyerId: 'someone_else' }), /not_found/);
  const result = await run();
  assert.deepEqual(await run({ apiKey: 'unused', fetchImpl: () => assert.fail('must not call model on replay') }), result);
  assert.throws(() => repository.history(input.requestId, 'someone_else'), /not_found/);
  assert.throws(() => db.exec("UPDATE negotiation_commits SET state_json = '{}'"), /immutable/);
  assert.throws(() => db.exec("UPDATE negotiation_runs SET final_json = '{}'"), /immutable/);
  assert.throws(() => db.exec("UPDATE negotiation_offers SET offer_json = '{}'"), /immutable/);
  const other = setup(t);
  other.repository.start(other.input.requestId, other.input.buyerId, {}, {}, { context: { context_revision: 0 } }, new Date(fixedNow).toISOString());
  assert.equal(other.repository.recoverInterrupted(), 1);
  assert.equal((await other.run()).error, 'interrupted_by_restart');
});
