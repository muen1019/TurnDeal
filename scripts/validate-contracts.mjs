import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateContract, validateSellerList, validateNegotiationTrace } from "./lib/contract-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = path.join(root, "contracts");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listJsonFiles(target) : [target];
    }),
  );
  return nested.flat().filter((file) => file.endsWith(".json"));
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function sameSet(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
}

function assertRanksComplete(output, eligibleIds, label) {
  const ranked = output.ranked_offers;
  assert.ok(Array.isArray(ranked) && ranked.length > 0, `${label} must contain rankings`);
  assert.deepEqual(
    ranked.map((entry) => entry.rank),
    ranked.map((_, index) => index + 1),
    `${label} ranks must be contiguous`,
  );
  const rankedIds = ranked.map((entry) => entry.offer_id);
  unique(rankedIds, `${label} offer IDs`);
  sameSet(rankedIds, eligibleIds, `${label} must rank every eligible ID exactly once`);
}

function isValidRanking(output, eligibleIds) {
  try {
    assertRanksComplete(output, eligibleIds, "model output");
    return true;
  } catch {
    return false;
  }
}

function assertStrictStructuredSchema(node, pathLabel = "schema") {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  if (node.type === "object" && node.properties) {
    assert.equal(node.additionalProperties, false, `${pathLabel} must reject additional properties`);
    assert.ok(Array.isArray(node.required), `${pathLabel} must list required properties`);
    assert.deepEqual(
      [...node.required].sort(),
      Object.keys(node.properties).sort(),
      `${pathLabel} must require every property`,
    );
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "minLength" || key === "maxLength") {
      assert.fail(`${pathLabel}.${key} is not in the selected Structured Outputs subset`);
    }
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        value.forEach((child, index) => assertStrictStructuredSchema(child, `${pathLabel}.${key}[${index}]`));
      } else {
        assertStrictStructuredSchema(value, `${pathLabel}.${key}`);
      }
    }
  }
}

function assertOfferShape(offer) {
  assert.ok(offer.offer_id && offer.seller_id, "formal offers need immutable IDs");
  assert.ok(Number.isInteger(offer.total_price_twd) && offer.total_price_twd > 0, "offer total must be positive integer TWD");
  assert.ok(Number.isInteger(offer.delivery_days) && offer.delivery_days > 0, "delivery days must be positive integer");

  const primary = offer.items.filter((item) => item.role === "primary" && item.category === "mouse");
  const addons = offer.items.filter((item) => item.role === "addon");
  assert.equal(primary.length, 1, `${offer.offer_id} must contain exactly one primary mouse`);
  assert.ok(offer.items.every((item) => item.quantity === 1), `${offer.offer_id} quantities must be one`);

  if (offer.variant === "standalone") {
    assert.equal(offer.baseline_offer_id, null, `${offer.offer_id} standalone baseline must be null`);
    assert.equal(offer.items.length, 1, `${offer.offer_id} standalone must contain one item`);
    assert.equal(offer.optional_addons, false, `${offer.offer_id} standalone cannot declare add-ons`);
  } else {
    assert.equal(offer.variant, "bundle", `${offer.offer_id} has unsupported variant`);
    assert.ok(offer.baseline_offer_id, `${offer.offer_id} bundle needs a baseline`);
    assert.equal(offer.items.length, 2, `${offer.offer_id} bundle must contain two items`);
    assert.equal(addons.length, 1, `${offer.offer_id} bundle needs exactly one add-on`);
    assert.equal(addons[0].category, "mouse_pad", `${offer.offer_id} add-on must be a mouse pad`);
    assert.equal(offer.optional_addons, true, `${offer.offer_id} add-on must be optional`);
  }
}

const jsonFiles = await listJsonFiles(contractsDir);
for (const file of jsonFiles) {
  JSON.parse(await readFile(file, "utf8"));
}
console.log(`✓ parsed ${jsonFiles.length} contract JSON files`);

const salesProfiles = await readJson('contracts/fixtures/sales-profiles.json');
salesProfiles.profiles.forEach(p => validateContract('SellerSalesProfile', p));
assert.equal(new Set(salesProfiles.profiles.map(p => p.seller_id)).size, 5);
assert.deepEqual(salesProfiles.profiles.map(p => p.persona_policy.persona),
  ['price_optimizer', 'speed_seller', 'bundle_curator', 'loyalty_builder', 'margin_guardian']);
assert.equal(salesProfiles.profiles.find(p => p.seller_id === 'seller_c').gift_exchange_discount_twd, 30);
const tradeoffs = await readJson('contracts/fixtures/negotiation-tradeoffs.json');
tradeoffs.proposals.forEach(p => validateContract('NegotiationProposal', p));
validateContract('NegotiationProposalResponse', tradeoffs.counteroffer);
assert.throws(() => validateContract('NegotiationProposal', { ...tradeoffs.proposals[0], variant: 'standalone' }));
assert.throws(() => validateContract('NegotiationProposal', { ...tradeoffs.proposals[1], reference_offer_id: null }));
assert.throws(() => validateContract('NegotiationProposal', { ...tradeoffs.proposals[2], benefit_kind: 'invented_service' }));

const sharing = await readJson('contracts/fixtures/negotiation-sharing.json');
validateContract('SharedNegotiationContext', sharing.context);
validateContract('SellerRFQ', sharing.rfq);
validateContract('NegotiationOutput', sharing.output);
assert.equal(sharing.rfq.round, sharing.context.completed_round + 1);
for (const term of sharing.rfq.competitive_terms) {
  assert.ok(sharing.context.offers.some(o => o.seller_id !== sharing.rfq.seller_id &&
    o.comparison_key === term.comparison_key && o.total_price_twd === term.total_price_twd &&
    o.delivery_days === term.delivery_days && o.expires_at === term.expires_at), 'competitive terms need a complete real source');
  for (const key of ['seller_id', 'offer_id', 'floor_price_twd', 'campaign', 'trust']) {
    assert.throws(() => validateContract('CompetitiveTerms', { ...term, [key]: 'private' }));
  }
}
validateSellerList(sharing.output.seller_agents);
assert.deepEqual(sharing.output.eligible_offer_ids, sharing.output.offers.filter(o => o.eligibility.status === 'eligible').map(o => o.offer_id));
console.log('✓ shared context fixture proves previous-round provenance and de-identified competitive terms');

const schema = await readJson("contracts/a2a-commerce.v0.3.schema.json");
const expectedDefs = [
  "CreateRequest",
  "DocumentBundle",
  "NormalizedIntent",
  "OrchestrationResult",
  "SellerRFQ",
  "SellerNegotiationResult",
  "Offer",
  "EvaluatorInput",
  "EvaluatorOutput",
  "RequestSnapshot",
  "DecisionResult",
  "RedemptionReceipt",
  "ErrorResponse",
  "MarketplaceEvidence",
  "MarketplaceSourceSnapshot",
  "CatalogProductFixture",
  "SellerFixtureStore",
  "DemoScenarioSuite",
];
for (const definition of expectedDefs) {
  assert.ok(schema.$defs[definition], `missing shared definition ${definition}`);
}
assert.equal(schema.$ref, "#/$defs/RequestSnapshot", "schema root must validate RequestSnapshot");
console.log("✓ shared schema exposes every integration boundary");

const openAiFormat = await readJson("contracts/openai/evaluator-output.schema.json");
assert.equal(openAiFormat.type, "json_schema");
assert.equal(openAiFormat.strict, true);
assert.equal(openAiFormat.schema.type, "object", "Structured Outputs root must be an object");
assert.equal(openAiFormat.schema.anyOf, undefined, "Structured Outputs root cannot be anyOf");
assertStrictStructuredSchema(openAiFormat.schema);
console.log("✓ Evaluator Structured Outputs schema is strict-compatible");

const marketplace = await readJson("contracts/fixtures/marketplace-source-snapshot.json");
assert.equal(marketplace.usage_policy.live_checkout_allowed, false, "fixtures cannot authorize live checkout");
assert.equal(marketplace.usage_policy.price_guarantee, false, "snapshot prices cannot be guaranteed");
const sourceIds = marketplace.sources.map((source) => source.source_id);
unique(sourceIds, "marketplace source IDs");
assert.ok(marketplace.sources.some((source) => source.marketplace === "shopee_tw"), "snapshot needs a Shopee Taiwan source");
assert.ok(marketplace.sources.some((source) => source.marketplace === "amazon_ie"), "snapshot needs an Amazon source");
assert.ok(marketplace.sources.some((source) => source.marketplace === "logitech_official"), "snapshot needs manufacturer specifications");
for (const source of marketplace.sources) {
  assert.doesNotThrow(() => new URL(source.url), `${source.source_id} needs a valid source URL`);
  if (source.source_type === "manufacturer_spec") {
    assert.equal(source.price, null, `${source.source_id} manufacturer spec cannot masquerade as a marketplace price`);
  }
  if (source.freshness === "stale_cached_reference") {
    assert.ok(source.notes.some((note) => note.includes("never use")), `${source.source_id} must explicitly prohibit stale-price decisions`);
  }
  if (source.marketplace === "shopee_tw" && source.price) {
    assert.equal(source.price.currency, "TWD", `${source.source_id} Taiwan price must use TWD`);
    assert.equal(source.freshness, "current", `${source.source_id} demo price source must be current`);
  }
}
console.log("✓ marketplace snapshot separates current Taiwan prices from stale reference data");

const sellerStore = await readJson("contracts/fixtures/sellers.json");
assert.equal(sellerStore.source_snapshot_id, marketplace.snapshot_id, "Seller catalog must name its source snapshot");
assert.ok(sellerStore.data_classification.public_snapshot_fields.includes("source_ids"), "catalog must identify public provenance fields");
assert.ok(sellerStore.data_classification.synthetic_demo_fields.includes("floor_price_twd"), "private floor prices must be labeled synthetic");
assert.equal(sellerStore.sellers.length, 5, "demo must have exactly five Sellers");
validateContract("SellerFixtureStore", sellerStore);
for (const seller of sellerStore.sellers) {
  const discounts = seller.strategy.round_discounts_twd;
  assert.ok(discounts.every((value, i) => i === 0 || value >= discounts[i - 1]), "Discount schedules must be nondecreasing");
}
const sellerIds = sellerStore.sellers.map((seller) => seller.seller_id);
unique(sellerIds, "seller IDs");
assert.deepEqual(
  sellerStore.sellers.map((seller) => seller.strategy.type),
  ["lowest_price_slow_delivery", "premium_fast_delivery", "value_bundle", "balanced_delivery", "firm_price"],
  "Seller strategies must remain visibly different",
);

const products = sellerStore.sellers.flatMap((seller) => seller.products);
unique(products.map((product) => product.product_id), "product IDs");
for (const product of products) {
  assert.ok(product.brand && product.model && product.name, `${product.product_id} needs a real product identity`);
  assert.ok(Number.isInteger(product.source_price_twd) && product.source_price_twd > 0, `${product.product_id} needs an integer TWD source price`);
  assert.ok(product.floor_price_twd <= product.list_price_twd, `${product.product_id} floor cannot exceed list price`);
  assert.ok(Number.isInteger(product.stock) && product.stock >= 0, `${product.product_id} stock must be a non-negative integer`);
  assert.ok(product.source_ids.length > 0, `${product.product_id} needs provenance`);
  assert.ok(product.source_ids.every((sourceId) => sourceIds.includes(sourceId)), `${product.product_id} has an unresolved source ID`);
  const referencedShopeePrices = marketplace.sources
    .filter((source) => product.source_ids.includes(source.source_id) && source.marketplace === "shopee_tw" && source.price)
    .map((source) => source.price.amount);
  assert.ok(referencedShopeePrices.includes(product.source_price_twd), `${product.product_id} source price must resolve to Shopee evidence`);
}
assert.ok(products.some((product) => product.stock === 0), "catalog needs an out-of-stock variant for discovery tests");
assert.ok(products.some((product) => product.attributes.color !== "black"), "catalog needs color-mismatch variants");
console.log("✓ Seller catalog has sourced products plus deterministic synthetic strategies");

const demoScenarios = await readJson("contracts/fixtures/demo-scenarios.json");
validateContract("DemoScenarioSuite", demoScenarios);
assert.equal(demoScenarios.scenarios.length, 10, "demo matrix must contain ten agreed scenarios");
unique(demoScenarios.scenarios.map((scenario) => scenario.scenario_id), "demo scenario IDs");
for (const scenario of demoScenarios.scenarios) {
  const eligibleIds = scenario.expected.eligible_offer_ids;
  unique(eligibleIds, `${scenario.scenario_id} eligible IDs`);
  if (scenario.expected.recommended_offer_id === null) {
    assert.equal(eligibleIds.length, 0, `${scenario.scenario_id} can omit recommendation only when no offers are eligible`);
  } else {
    assert.ok(eligibleIds.includes(scenario.expected.recommended_offer_id), `${scenario.scenario_id} recommendation must be eligible`);
  }
}
const scenarioFaults = new Set(demoScenarios.scenarios.flatMap((scenario) => scenario.runtime_faults));
for (const requiredFault of ["seller_b_timeout_round_one", "seller_c_round_two_refused", "clock_after_all_offer_expiry", "evaluator_invents_offer_id"]) {
  assert.ok(scenarioFaults.has(requiredFault), `scenario matrix must cover ${requiredFault}`);
}
assert.ok(demoScenarios.scenarios.some((scenario) => scenario.intent.bundle_mode === "disabled"), "scenario matrix must cover disabled bundles");
assert.ok(demoScenarios.scenarios.some((scenario) => scenario.expected.request_status === "no_match"), "scenario matrix must cover no-match results");
console.log("✓ demo matrix covers preferences, no-match, timeout, refusal, expiry and model attacks");

const happy = await readJson("contracts/fixtures/happy-path.json");
validateNegotiationTrace(happy);
validateContract("CreateRequest", happy.request.create_request);
validateContract("DocumentBundle", happy.request.documents);
validateContract("NormalizedIntent", happy.request.normalized_intent);
validateContract("RequestSnapshot", happy.snapshot);
validateContract("EvaluatorInput", happy.evaluator_input);
validateContract("EvaluatorOutput", happy.evaluator_output);
assert.equal(happy.orchestration.seller_agents.length, 5, "happy path must discover all Sellers");
assert.deepEqual(
  happy.orchestration.seller_agents.map((seller) => seller.listing_rank),
  [1, 2, 3, 4, 5],
  "natural listing ranks must be contiguous",
);
assert.ok(sellerIds.includes(happy.orchestration.sponsored_placement.seller_id), "Sponsored Seller must already be eligible");

assert.equal(happy.rfqs.length, 19, "A/B/C negotiate five rounds, D three, E one");
for (const sellerId of sellerIds) {
  const sellerRfqs = happy.rfqs.filter((rfq) => rfq.seller_id === sellerId);
  const count = sellerStore.sellers.find(s => s.seller_id === sellerId).strategy.final_round ?? 5;
  assert.deepEqual(sellerRfqs.map((rfq) => rfq.round), Array.from({ length: count }, (_, i) => i + 1), `${sellerId} RFQs must stop at its final round or round five`);
  for (const rfq of sellerRfqs) {
    assert.equal("source_text" in rfq, false, "RFQ cannot contain original source text at root");
    assert.ok(rfq.product_preferences.every((preference) => !("source_text" in preference)), "RFQ preferences must omit source text");
    assert.equal("max_total_twd" in rfq, false, "RFQ must not reveal private maximum budget");
  }
}

assert.equal(happy.negotiations.length, 5, "happy path must include five negotiation branches");
const finalDraftBySeller = new Map();
for (const negotiation of happy.negotiations) {
  const strategy = sellerStore.sellers.find(s => s.seller_id === negotiation.seller_id).strategy;
  assert.deepEqual(negotiation.rounds.map((round) => round.result.round), Array.from({ length: strategy.final_round ?? 5 }, (_, i) => i + 1));
  for (const round of negotiation.rounds) {
    assert.equal(round.result.seller_id, negotiation.seller_id, "Seller branches cannot cross identities");
    assert.ok(round.result.drafts.every((draft) => !("eligibility" in draft)), "Seller drafts cannot self-declare eligibility");
    assert.ok(round.result.drafts.every((draft) => !("offer_id" in draft)), "Backend must assign formal offer IDs");
    for (const bundle of round.result.drafts.filter((draft) => draft.variant === "bundle")) {
      assert.ok(
        round.result.drafts.some((draft) => draft.draft_ref === bundle.baseline_draft_ref && draft.variant === "standalone"),
        "Seller bundle baseline_draft_ref must resolve to a same-round standalone draft",
      );
    }
  }
  finalDraftBySeller.set(negotiation.seller_id, negotiation.rounds.at(-1).result.drafts[0]);

  const seller = sellerStore.sellers.find((entry) => entry.seller_id === negotiation.seller_id);
  const primaryProduct = seller.products.find((product) => product.category === "mouse" && product.attributes.color === "black");
  const expectedRoundPrices = seller.strategy.round_discounts_twd.slice(0, seller.strategy.final_round ?? 5).map(discount => primaryProduct.list_price_twd - discount);
  assert.deepEqual(
    negotiation.rounds.map((round) => round.result.drafts[0].total_price_twd),
    expectedRoundPrices,
    `${negotiation.seller_id} prices must follow its deterministic discounts`,
  );
  assert.ok(expectedRoundPrices.every(price => price >= primaryProduct.floor_price_twd), `${negotiation.seller_id} final price cannot cross its synthetic floor`);
}

const aFinal = finalDraftBySeller.get("seller_a");
const bFinal = finalDraftBySeller.get("seller_b");
const cFinal = finalDraftBySeller.get("seller_c");
assert.ok(aFinal.total_price_twd < cFinal.total_price_twd && cFinal.total_price_twd < bFinal.total_price_twd, "Seller A must be cheapest and Seller B most expensive");
assert.ok(aFinal.delivery_days > bFinal.delivery_days, "Seller A must be slower than Seller B");
assert.equal(bFinal.delivery_days, 1, "Seller B must be the fastest one-day option");
assert.ok(happy.negotiations.find((entry) => entry.seller_id === "seller_c").rounds[1].result.drafts.some((draft) => draft.variant === "bundle"), "Seller C must offer a bundle");

const snapshot = happy.snapshot;
assert.equal(snapshot.status, "awaiting_user");
assert.deepEqual(snapshot.seller_agents, happy.orchestration.seller_agents, "published Seller list must match frozen orchestration output");
assert.deepEqual(snapshot.sponsored_placement, happy.orchestration.sponsored_placement, "Sponsored placement must be display-only and stable");

const offerIds = snapshot.offers.map((offer) => offer.offer_id);
unique(offerIds, "formal offer IDs");
for (const offer of snapshot.offers) {
  assertOfferShape(offer);
  const branch = happy.negotiations.find(n => n.seller_id === offer.seller_id);
  const draft = branch?.rounds.at(-1).result.drafts.find(d => d.variant === offer.variant);
  assert.ok(draft, "Final snapshot offers must resolve to their Seller's last proposal");
  assert.equal(offer.round, branch.rounds.at(-1).result.round);
  const { offer_id, seller_id, round, baseline_offer_id, eligibility, ...offerTerms } = offer;
  const { draft_ref, baseline_draft_ref, ...draftTerms } = draft;
  assert.deepEqual(offerTerms, draftTerms, "Backend-assigned IDs must retain every negotiated commercial term");
  assert.equal(offer.eligibility.status, "eligible", `${offer.offer_id} must be eligible in happy path`);
  assert.ok(offer.total_price_twd <= snapshot.intent.max_total_twd, `${offer.offer_id} exceeds the hard budget`);
  assert.ok(offer.delivery_days <= snapshot.intent.delivery_days_max, `${offer.offer_id} misses the delivery limit`);
  assert.ok(new Date(offer.expires_at) > new Date(happy.now), `${offer.offer_id} is expired`);
  assert.ok(snapshot.intent.required_features.every((feature) => offer.primary_features.includes(feature)), `${offer.offer_id} misses a required feature`);
}

for (const seller of snapshot.seller_agents) {
  const sellerOfferIds = snapshot.offers.filter((offer) => offer.seller_id === seller.seller_id).map((offer) => offer.offer_id);
  sameSet(seller.final_offer_ids, sellerOfferIds, `${seller.seller_id} final offer references must resolve`);
  assert.ok(seller.final_offer_ids.length <= 2, `${seller.seller_id} cannot publish more than two final offers`);
}

for (const bundle of snapshot.offers.filter((offer) => offer.variant === "bundle")) {
  const baseline = snapshot.offers.find((offer) => offer.offer_id === bundle.baseline_offer_id);
  assert.ok(baseline, `${bundle.offer_id} baseline must exist in the frozen snapshot`);
  assert.equal(baseline.seller_id, bundle.seller_id, `${bundle.offer_id} baseline must belong to the same Seller`);
  assert.equal(baseline.items[0].product_id, bundle.items.find((item) => item.role === "primary").product_id, `${bundle.offer_id} baseline must use the same primary SKU`);
  assert.ok(bundle.total_price_twd <= baseline.total_price_twd, `${bundle.offer_id} cannot add cost without consent`);
  assert.ok(bundle.delivery_days <= baseline.delivery_days, `${bundle.offer_id} cannot delay delivery`);
  assert.equal(bundle.terms_id, baseline.terms_id, `${bundle.offer_id} cannot worsen terms`);
}

const eligibleIds = snapshot.offers.filter((offer) => offer.eligibility.status === "eligible").map((offer) => offer.offer_id);
assertRanksComplete({ ranked_offers: snapshot.ranked_offers }, eligibleIds, "published snapshot");
assertRanksComplete(happy.evaluator_output, eligibleIds, "Evaluator output");
assert.equal("sponsored_placement" in happy.evaluator_input, false, "Evaluator input must exclude Sponsored placement");
assert.equal("campaigns" in happy.evaluator_input, false, "Evaluator input must exclude campaigns");
sameSet(happy.evaluator_input.offers.map((offer) => offer.offer_id), eligibleIds, "Evaluator input must contain only every eligible offer");
assert.notEqual(happy.evaluator_output.ranked_offers[0].offer_id.startsWith("offer_b"), true, "Sponsored Seller must not automatically rank first");
sameSet(happy.fallback_output.ranked_offer_ids, eligibleIds, "fallback must rank the same eligible set");
console.log("✓ happy path proves five-Seller negotiation capped at five rounds with early finals and safe independent ranking");

// Boundary and lifecycle regression checks exercise real schema validation and
// cross-object semantics, including valid smaller discovery results.
for (const count of [0, 1, 4, 5]) {
  const result = structuredClone(happy.orchestration);
  result.seller_agents = result.seller_agents.slice(0, count);
  result.sponsored_placement = null;
  validateContract("OrchestrationResult", result);
  validateSellerList(result.seller_agents);
}
const sixth = structuredClone(happy.orchestration);
sixth.seller_agents.push({ ...structuredClone(sixth.seller_agents[0]), seller_id: "seller_f", listing_rank: 6 });
assert.throws(() => validateContract("OrchestrationResult", sixth), /OrchestrationResult/);
assert.throws(() => validateContract("RequestSnapshot", { ...snapshot, seller_agents: sixth.seller_agents }), /RequestSnapshot/);
const duplicate = structuredClone(happy.orchestration.seller_agents);
duplicate[1].seller_id = duplicate[0].seller_id;
assert.throws(() => validateSellerList(duplicate), /Seller IDs must be unique/);
assert.throws(() => validateSellerList(happy.orchestration.seller_agents, { seller_id: "seller_f" }), /already be selected/);

for (const [definition, example] of [
  ["SellerRFQ", happy.rfqs[0]],
  ["SellerNegotiationResult", happy.negotiations[0].rounds[0].result],
  ["SellerRound", happy.orchestration.seller_agents[0].rounds[0]],
  ["Offer", snapshot.offers[0]],
]) {
  for (const round of [0, 6, 1.5]) assert.throws(() => validateContract(definition, { ...example, round }), new RegExp(definition));
  for (const round of [1, 5]) validateContract(definition, { ...example, round });
}
const resumeFinal = structuredClone(happy);
const finished = resumeFinal.negotiations.find(n => n.seller_id === "seller_e");
const finishedSeller = resumeFinal.orchestration.seller_agents.find(s => s.seller_id === "seller_e");
finished.rounds.push({ ...structuredClone(finished.rounds[0]), result: { ...finished.rounds[0].result, round: 2 } });
finishedSeller.rounds.push({ ...finishedSeller.rounds[0], round: 2 });
resumeFinal.rfqs.push({ ...structuredClone(resumeFinal.rfqs.find(q => q.seller_id === "seller_e")), round: 2, previous_offer_ids: finishedSeller.rounds[0].offer_ids });
assert.throws(() => validateNegotiationTrace(resumeFinal), /final branch cannot receive another round/);

for (const outcome of ["refused", "timeout", "error"]) {
  const seller = structuredClone(happy.orchestration.seller_agents[0]);
  seller.rounds = [seller.rounds[0], { round: 2, outcome, is_final: false, offer_ids: [] }];
  seller.status = outcome;
  seller.stop_reason = outcome;
  seller.final_offer_ids = seller.rounds[0].offer_ids;
  validateSellerList([seller]); // Retains the last validated quote after failure.
  const result = { ...happy.negotiations[0].rounds[0].result, round: 2, outcome, is_final: false, drafts: [] };
  validateContract("SellerNegotiationResult", result);
  assert.throws(() => validateContract("SellerNegotiationResult", { ...result, is_final: true }), /SellerNegotiationResult/);
  seller.rounds.push({ round: 3, outcome: "offered", is_final: false, offer_ids: ["late_offer"] });
  assert.throws(() => validateSellerList([seller]), /failed branch cannot receive another round/);
}
for (const stop_reason of ["no_adjustment", "global_deadline", "call_budget", "token_budget"]) {
  const seller = structuredClone(happy.orchestration.seller_agents[0]);
  seller.rounds = seller.rounds.slice(0, 2);
  seller.stop_reason = stop_reason;
  seller.final_offer_ids = seller.rounds.at(-1).offer_ids;
  validateSellerList([seller]);
}
const sixthRound = structuredClone(happy.orchestration.seller_agents[0]);
sixthRound.rounds.push({ ...sixthRound.rounds.at(-1), round: 6 });
assert.throws(() => validateSellerList([sixthRound]), /SellerAgent/);
const repeatedRound = structuredClone(happy.orchestration.seller_agents[0]);
repeatedRound.rounds[1].round = 1;
assert.throws(() => validateSellerList([repeatedRound]), /contiguous and unique/);
const prematureLimit = structuredClone(happy.orchestration.seller_agents[0]);
prematureLimit.rounds = prematureLimit.rounds.slice(0, 2);
assert.throws(() => validateSellerList([prematureLimit]), /max_rounds requires completed round five/);
console.log("✓ rejects sixth Seller/round, duplicate branches and dispatch after final/failure; allows smaller lists and bounded early stops");

const edge = await readJson("contracts/fixtures/edge-cases.json");
for (const testCase of edge.cases) {
  assertOfferShape(testCase.offer);
  assert.equal(testCase.offer.eligibility.status, testCase.expected_status, `${testCase.case_id} status mismatch`);
  sameSet(testCase.offer.eligibility.reason_codes, testCase.expected_reason_codes, `${testCase.case_id} reason mismatch`);
}
for (const attack of edge.evaluator_output_attacks) {
  assert.equal(isValidRanking(attack.model_output, attack.eligible_offer_ids), false, `${attack.case_id} should be rejected`);
  sameSet(attack.fallback_ranked_offer_ids, attack.eligible_offer_ids, `${attack.case_id} fallback must remain complete`);
}
console.log("✓ edge cases reject hard-constraint violations and invalid model-selected IDs");

const api = await readJson("contracts/fixtures/api-examples.json");
const redemption = await readJson("contracts/archive/redemption-example.v0.2.json");
validateContract("CreateRequest", api.create_request.body);
validateContract("AcceptDecision", api.accept_decision.body);
validateContract("RejectDecision", api.reject_decision_alternative.body);
validateContract("RedeemRequest", redemption.body);
validateContract("RequestSnapshot", api.create_request.response);
validateContract("DecisionResult", api.accept_decision.response);
validateContract("DecisionResult", api.reject_decision_alternative.response);
validateContract("RedemptionReceipt", redemption.response);
assert.equal(redemption.response.offer_id, api.accept_decision.body.offer_id);
assert.equal(redemption.response.total_price_twd, snapshot.offers.find(o => o.offer_id === redemption.body.offer_id).total_price_twd, "Redemption receipt must retain the immutable accepted price");
for (const example of [api.create_request, api.accept_decision, api.reject_decision_alternative, redemption]) {
  assert.ok(example.http.headers["Idempotency-Key"], `${example.http.method} ${example.http.path} needs Idempotency-Key`);
}
assert.equal(api.get_request.http.headers["Idempotency-Key"], undefined, "GET must not require Idempotency-Key");
assert.equal(redemption.body.total_price_twd, undefined, "redemption client must not submit a price");
console.log("✓ Current API examples preserve idempotency; archived redemption retains immutable pricing");

console.log("\nAll A2A Commerce contract checks passed.");
