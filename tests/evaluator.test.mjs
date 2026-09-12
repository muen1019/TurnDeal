import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { prepareDemoRequest, demoFixture } from '../scripts/lib/negotiation-demo.mjs';
import { applySalesProfiles } from '../scripts/lib/sales-profiles.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { evaluate, rankOffers, recoverInterruptedEvaluations } from '../src/evaluator/index.mjs';
import { buildEvaluatorInput, deterministicRanking, evaluatorFormat, groupSolutions, validateRanking, validateExplanation } from '../src/evaluator/ranking.mjs';
import { revalidateOffers } from '../src/evaluator/validation.mjs';
import { ModelGateway } from '../src/negotiation/model.mjs';
import { check } from '../src/negotiation/contracts.mjs';

const NOW = Date.parse('2026-09-12T05:00:00Z');
const pureInput = () => structuredClone(demoFixture.evaluator_input);
const response = output => ({ ok: true, json: async () => ({ status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }], usage: { total_tokens: 100 } }) });
async function setup(t, { intent, count = 5 } = {}) {
  const db = new DatabaseSync(':memory:'); initializeDatabase(db); applySalesProfiles(db); t.after(() => db.close());
  const input = prepareDemoRequest(db, { intent });
  input.orchestration.seller_agents = input.orchestration.seller_agents.slice(0, count);
  input.orchestration.sponsored_placement = null;
  const repository = new NegotiationRepository(db);
  await negotiate({ ...input, repository, now: () => NOW });
  return { db, input, repository, run: extra => evaluate({ db, ...input, now: () => NOW, ...extra }) };
}

test('deterministic ranking honors price, delivery and trust preferences without losing offers', () => {
  const input = pureInput();
  for (const [priority, seller] of [['price_first','seller_a'], ['delivery_first','seller_b'], ['trust_first','seller_a']]) {
    input.intent.preferences = [priority];
    const output = deterministicRanking(input); validateRanking(output, input);
    assert.equal(input.offers.find(o => o.offer_id === output.ranked_offers[0].offer_id).seller_id, seller);
    assert.equal(output.ranked_offers.length, input.offers.length);
  }
});

test('unknown, duplicate, missing IDs, rank gaps, blank reasons and reversed preference are rejected', () => {
  const input = pureInput(); const good = deterministicRanking(input);
  const mutations = [
    o => { o.ranked_offers[0].offer_id = 'invented_offer'; },
    o => { o.ranked_offers[1].offer_id = o.ranked_offers[0].offer_id; },
    o => { o.ranked_offers.pop(); }, o => { o.ranked_offers[0].rank = 2; },
    o => { o.ranked_offers[0].reason = ' '; },
    o => { o.ranked_offers.reverse().forEach((r, i) => r.rank = i + 1); },
  ];
  for (const mutate of mutations) { const bad = structuredClone(good); mutate(bad); assert.throws(() => validateRanking(bad, input)); }
  assert.throws(() => validateRanking(good, input, Date.parse(input.offers[0].expires_at)), /invalid/);
});

test('Evaluator projection excludes ads/private fields and checks unique trust provenance', () => {
  const input = pureInput(); const extra = { sponsored_placement: { seller_id: 'seller_b' }, floor_price: 1 };
  const build = sellerTrust => buildEvaluatorInput({ requestId: input.request_id, intent: input.intent, offers: input.offers,
    sellerTrust, now: Date.parse(input.evaluated_at), ...extra });
  const projected = build(input.seller_trust.map(s => ({ ...s, campaign: 'private' })));
  assert.ok(!/campaign|sponsored|floor_price/.test(JSON.stringify(projected)));
  assert.throws(() => build(input.seller_trust.slice(1)), /trust_set/);
  assert.ok(Object.isFrozen(projected.offers));
});

test('explanations cannot round money or falsely claim fastest delivery', () => {
  const input = pureInput();
  const offer = input.offers.find(o => o.seller_id === 'seller_a');
  assert.throws(() => validateExplanation({ reason: `${offer.total_price_twd + 1}元，${offer.delivery_days}天`, tradeoffs: [] }, offer, input), /wrong_amount/);
  assert.throws(() => validateExplanation({ reason: `交貨最快${offer.delivery_days}天`, tradeoffs: [] }, offer, input), /unsupported/);
  assert.throws(() => validateExplanation({ reason: '符合預算', tradeoffs: ['比最低價格高999元'] }, offer, input), /wrong_comparison/);
  assert.doesNotThrow(() => validateExplanation({ reason: `NT$${offer.total_price_twd}，配送 ${offer.delivery_days} 天`, tradeoffs: [`比最快配送慢 ${offer.delivery_days - 1} 天`] }, offer, input));
});

test('Responses sends the exact approved output schema and independent prompt', async () => {
  const input = pureInput(); let seen;
  const gateway = new ModelGateway({ apiKey: 'unit-only', fetchImpl: async (_, init) => {
    seen = JSON.parse(init.body); return response(deterministicRanking(input));
  } });
  const ranked = await rankOffers({ input, gateway, now: () => Date.parse(input.evaluated_at) });
  assert.equal(ranked.provider, 'openai'); assert.deepEqual(seen.text.format, evaluatorFormat);
  assert.equal(seen.store, false); assert.match(seen.instructions, /independent OfferMesh Evaluator/);
  assert.ok(!JSON.stringify(ranked.audit).includes('unit-only'));
});

test('invalid model ordering and unavailable/timeout/truncated/refused outputs use bounded fallback', async () => {
  const input = pureInput();
  const transports = [async () => response({ ranked_offers: [] }), async () => ({ ok: false, status: 429 }),
    () => new Promise(() => {}), async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }),
    async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }) })];
  for (const fetchImpl of transports) {
    const gateway = new ModelGateway({ apiKey: 'test', fetchImpl, timeoutMs: 10, maxCalls: 1 });
    const result = await rankOffers({ input, gateway, now: () => Date.parse(input.evaluated_at) });
    assert.equal(result.provider, 'deterministic_fallback'); assert.equal(result.usage.calls, 1);
    assert.deepEqual(result.output, deterministicRanking(input));
  }
});

test('runtime publishes seven ranked immutable offers as five groups; no automatic acceptance', async t => {
  const { db, input, run } = await setup(t);
  const result = await run();
  assert.equal(result.status, 'awaiting_user'); assert.equal(result.snapshot.ranked_offers.length, 7);
  assert.equal(result.solutions.length, 5); assert.equal(result.snapshot.selected_offer_id, null);
  assert.deepEqual(result.solutions.map(s => s.seller_id), ['seller_a','seller_d','seller_c','seller_e','seller_b']);
  const d = result.solutions.find(s => s.seller_id === 'seller_d');
  assert.equal(result.snapshot.offers.find(o => o.offer_id === d.recommended_offer_id).total_price_twd, 600);
  assert.equal(d.alternative_offer_ids.length, 1);
  assert.deepEqual(groupSolutions(result.snapshot.ranked_offers, result.snapshot.offers), result.solutions);
  check('RequestSnapshot', result.snapshot);
  const replay = await run({ apiKey: 'unused', fetchImpl: () => assert.fail('replay cannot call API'), now: () => NOW + 99999999 });
  assert.deepEqual(replay, result); // historical snapshot remains immutable after expiry
  assert.throws(() => db.prepare("UPDATE evaluation_runs SET result_json='{}' WHERE request_id=?").run(input.requestId), /immutable/);
  assert.throws(() => db.prepare("UPDATE requests SET published_snapshot_json='{}' WHERE request_id=?").run(input.requestId), /immutable/);
  await assert.rejects(run({ buyerId: 'foreign_buyer' }), /not_found/);
});

test('stock or terms lost before evaluation is excluded and zero eligible offers skip inference', async t => {
  const { db, run } = await setup(t);
  db.exec('UPDATE seller_inventory SET stock=0');
  const result = await run({ apiKey: 'unused', fetchImpl: () => assert.fail('nothing to rank') });
  assert.equal(result.status, 'no_match'); assert.equal(result.provider, 'skipped'); assert.equal(result.usage.calls, 0);
  assert.deepEqual(result.snapshot.ranked_offers, []);
});

test('expiry during inference invalidates the complete set before publication', async t => {
  const { run } = await setup(t); let clock = NOW;
  const result = await run({ now: () => clock, apiKey: 'test', fetchImpl: async (_, init) => {
    const input = JSON.parse(JSON.parse(init.body).input[0].content);
    clock = NOW + 600001; return response(deterministicRanking(input));
  } });
  assert.equal(result.status, 'no_match'); assert.equal(result.fallback_reason, 'eligible_set_changed');
  assert.equal(result.snapshot.ranked_offers.length, 0);
});

test('one seller loses inventory during inference; remaining set and explanations are rebuilt', async t => {
  const { db, run } = await setup(t);
  const result = await run({ apiKey: 'test', fetchImpl: async (_, init) => {
    const input = JSON.parse(JSON.parse(init.body).input[0].content);
    db.prepare('UPDATE seller_inventory SET stock=0 WHERE seller_id=?').run('seller_a');
    return response(deterministicRanking(input));
  } });
  assert.equal(result.solutions.length, 4); assert.equal(result.solutions[0].seller_id, 'seller_d');
  assert.ok(!result.snapshot.offers.some(o => o.seller_id === 'seller_a'));
  assert.equal(result.fallback_reason, 'eligible_set_changed');
  const row = db.prepare('SELECT input_json, ranked_offers_json FROM evaluations WHERE request_id=?').get(result.request_id);
  const savedInput = JSON.parse(row.input_json);
  assert.ok(!savedInput.offers.some(o => o.seller_id === 'seller_a'));
  validateRanking({ ranked_offers: JSON.parse(row.ranked_offers_json) }, savedInput, NOW);
});

test('inventory replenishment cannot revive a quote excluded before evaluation', async t => {
  const { db, run } = await setup(t);
  db.prepare('UPDATE seller_inventory SET stock=0 WHERE seller_id=?').run('seller_b');
  const result = await run({ apiKey: 'test', fetchImpl: async (_, init) => {
    const input = JSON.parse(JSON.parse(init.body).input[0].content);
    assert.ok(!input.offers.some(o => o.seller_id === 'seller_b'));
    db.prepare('UPDATE seller_inventory SET stock=10 WHERE seller_id=?').run('seller_b');
    return response(deterministicRanking(input));
  } });
  assert.equal(result.solutions.length, 4);
  assert.ok(!result.snapshot.offers.some(o => o.seller_id === 'seller_b'));
});

test('changed fulfillment terms invalidate quotes even if the terms ID stays the same', async t => {
  const { db, run } = await setup(t);
  db.exec('UPDATE terms SET warranty_months=warranty_months+1');
  const result = await run({ apiKey: 'unused', fetchImpl: () => assert.fail('changed terms cannot enter ranking') });
  assert.equal(result.status, 'no_match');
});

test('concurrent evaluation cannot issue a second paid call', async t => {
  const { run } = await setup(t); let release;
  const first = run({ apiKey: 'test', fetchImpl: async (_, init) => {
    const input = JSON.parse(JSON.parse(init.body).input[0].content);
    await new Promise(resolve => { release = resolve; }); return response(deterministicRanking(input));
  } });
  await assert.rejects(run(), /evaluation_in_progress/); release(); await first;
});

test('startup recovery marks interrupted evaluation failed without repeating inference', async t => {
  const { db, input, run } = await setup(t);
  db.prepare("INSERT INTO evaluation_runs (request_id,status,input_json,result_json,started_at,completed_at) VALUES (?, 'running', NULL, NULL, ?, NULL)").run(input.requestId, new Date(NOW).toISOString());
  assert.equal(recoverInterruptedEvaluations(db, NOW), 1);
  const result = await run({ apiKey: 'unused', fetchImpl: () => assert.fail('no retry') });
  assert.equal(result.status, 'failed'); assert.equal(result.error, 'interrupted_by_restart');
});

test('hard budgets, quantities, unrelated/paid bundles and terms are independently rechecked', async t => {
  const { db, input, repository } = await setup(t);
  const final = repository.existing(input.requestId, input.buyerId);
  const source = JSON.parse(db.prepare('SELECT input_json FROM negotiation_runs WHERE request_id=?').get(input.requestId).input_json);
  const validate = offers => revalidateOffers({ offers, intent: source.intent, catalog: source.catalog, originalCatalog: source.catalog, orchestration: source.orchestration, now: NOW });
  for (const mutate of [o => { o.total_price_twd = 1001; }, o => { o.items[0].quantity = 2; },
    o => { o.delivery_days = 8; }, o => { o.terms_id = 'fake'; }, o => { o.primary_features = ['wireless']; }]) {
    const offers = structuredClone(final.offers); const target = offers.find(o => o.seller_id === 'seller_a'); mutate(target);
    assert.ok(!validate(offers).some(o => o.seller_id === 'seller_a'));
  }
  const paid = structuredClone(final.offers); paid.find(o => o.seller_id === 'seller_c' && o.variant === 'bundle').total_price_twd += 100;
  assert.ok(!validate(paid).some(o => o.seller_id === 'seller_c' && o.variant === 'bundle'));
});
