import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from './db.mjs';
import { demoFixture, prepareDemoRequest } from './lib/negotiation-demo.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { evaluate } from '../src/evaluator/index.mjs';

const scenarios = JSON.parse(readFileSync(new URL('../contracts/fixtures/demo-scenarios.json', import.meta.url))).scenarios;
const presets = {
  'best-price': 'price_first_all_sellers',
  'fast-delivery': 'delivery_first_all_sellers',
  'no-addons': 'bundle_disabled',
  'strict-budget': 'strict_budget_no_match',
};
const directory = new URL('../site/public/demo-traces/', import.meta.url);
mkdirSync(directory, { recursive: true });
const time = Date.parse('2026-09-12T00:00:00Z');
const benefitKinds = ['delivery_guarantee','late_compensation','future_coupon','return_extension','warranty_extension','priority_support','exchange_guarantee','gift','shipping_upgrade'];
const proposalKinds = ['exchange_gift','lower_price','request_benefit','compare','add_gift'];
function publicOffer(offer) {
  assert.ok(Number.isInteger(offer.total_price_twd) && offer.total_price_twd >= 0);
  assert.ok(Number.isInteger(offer.delivery_days) && offer.delivery_days > 0);
  assert.ok(['bundle', 'standalone'].includes(offer.variant));
  return { price: offer.total_price_twd, days: offer.delivery_days, bundle: offer.variant === 'bundle',
    benefits: (offer.benefits ?? []).map(b => b.kind).filter(kind => benefitKinds.includes(kind)) };
}
for (const [preset, scenarioId] of Object.entries(presets)) {
  const scenario = scenarios.find(item => item.scenario_id === scenarioId);
  const db = new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);
    const { max_total_twd, delivery_days_max, required_features, preferences, bundle_mode } = scenario.intent;
    const intent = { ...demoFixture.request.normalized_intent, max_total_twd, delivery_days_max, required_features, preferences,
      negotiation_policy: { bundle_mode, max_addon_increment_twd: 0,
        allowed_addon_categories: bundle_mode === 'disabled' ? [] : ['mouse_pad'] } };
    const input = prepareDemoRequest(db, { intent, now: new Date(time).toISOString() });
    const repository = new NegotiationRepository(db);
    const result = await negotiate({ ...input, repository, apiKey: '', now: () => time });
    assert.equal(result.usage.calls, 0);
    const evaluated = await evaluate({ db, requestId: input.requestId, buyerId: input.buyerId, apiKey: '', now: () => time });
    const { snapshot } = evaluated;
    assert.equal(snapshot.status, scenario.expected.request_status);
    const history = repository.history(input.requestId, input.buyerId);
    const traces = history.at(-1).traces;
    const sellers = result.seller_agents.map(branch => branch.seller_id);
    assert.deepEqual([...sellers].sort(), ['seller_a','seller_b','seller_c','seller_d','seller_e']);
    const rounds = history.slice(1).map(state => {
      const round = state.context.round ?? state.context.context_revision;
      return state.seller_agents.map(branch => {
        const event = traces.find(item => item.round === round && item.seller_id === branch.seller_id);
        const last = branch.rounds.find(item => item.round === round);
        const offers = state.offers.filter(offer => branch.final_offer_ids.includes(offer.offer_id) && offer.eligibility.status === 'eligible');
        const outcome = last?.outcome ?? branch.status;
        assert.ok(['offered','negotiating','pending','no_match','refused','timeout','error'].includes(outcome), outcome);
        const proposal = event?.rfq?.proposal?.kind;
        const previous = history[round - 1].seller_agents.find(item => item.seller_id === branch.seller_id);
        const updated = offers.some(offer => !previous?.final_offer_ids.includes(offer.offer_id));
        return { status: outcome, updated, done: Boolean(branch.stop_reason),
          proposal: proposalKinds.includes(proposal) ? proposal : null, quotes: offers.map(publicOffer) };
      });
    });
    assert.ok(rounds.length > 0 && rounds.length <= 5);
    const offers = snapshot.ranked_offers.map(rank => {
      const offer = snapshot.offers.find(item => item.offer_id === rank.offer_id);
      assert.equal(offer.eligibility.status, 'eligible');
      assert.ok(offer.total_price_twd <= intent.max_total_twd && offer.delivery_days <= intent.delivery_days_max);
      return { seller: sellers.indexOf(offer.seller_id), ...publicOffer(offer) };
    });
    assert.equal(offers.length === 0, preset === 'strict-budget');
    if (preset === 'no-addons') assert.ok(offers.every(offer => !offer.bundle));
    if (preset === 'fast-delivery') assert.equal(offers[0].days, Math.min(...offers.map(offer => offer.days)));
    if (preset === 'best-price') assert.equal(offers[0].price, Math.min(...offers.map(offer => offer.price)));
    const path = new URL(preset + '.json', directory);
    const json = JSON.stringify({ version: 1, budget: intent.max_total_twd, days: intent.delivery_days_max, rounds, offers }) + '\n';
    if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'), json, preset + ' trace is stale');
    else writeFileSync(path, json);
    console.log(preset + ': ' + rounds.length + ' rounds, ' + offers.length + ' eligible offers');
  } finally {
    db.close();
  }
}
