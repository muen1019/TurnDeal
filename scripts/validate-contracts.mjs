import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const schema = await readJson("contracts/a2a-commerce.v0.1.schema.json");
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

const sellerStore = await readJson("contracts/fixtures/sellers.json");
assert.equal(sellerStore.sellers.length, 3, "demo must have exactly three Sellers");
const sellerIds = sellerStore.sellers.map((seller) => seller.seller_id);
unique(sellerIds, "seller IDs");
assert.deepEqual(
  sellerStore.sellers.map((seller) => seller.strategy.type),
  ["lowest_price_slow_delivery", "premium_fast_delivery", "value_bundle"],
  "Seller strategies must remain visibly different",
);

const products = sellerStore.sellers.flatMap((seller) => seller.products);
unique(products.map((product) => product.product_id), "product IDs");
for (const product of products) {
  assert.ok(product.floor_price_twd <= product.list_price_twd, `${product.product_id} floor cannot exceed list price`);
  assert.ok(Number.isInteger(product.stock) && product.stock >= 0, `${product.product_id} stock must be a non-negative integer`);
}
console.log("✓ Seller catalog has three deterministic, internally valid strategies");

const happy = await readJson("contracts/fixtures/happy-path.json");
assert.equal(happy.orchestration.seller_agents.length, 3, "happy path must discover all Sellers");
assert.deepEqual(
  happy.orchestration.seller_agents.map((seller) => seller.listing_rank),
  [1, 2, 3],
  "natural listing ranks must be contiguous",
);
assert.ok(sellerIds.includes(happy.orchestration.sponsored_placement.seller_id), "Sponsored Seller must already be eligible");

assert.equal(happy.rfqs.length, 6, "three Sellers need one RFQ for each of two rounds");
for (const sellerId of sellerIds) {
  const sellerRfqs = happy.rfqs.filter((rfq) => rfq.seller_id === sellerId);
  assert.deepEqual(sellerRfqs.map((rfq) => rfq.round), [1, 2], `${sellerId} needs round 1 and 2 RFQs`);
  for (const rfq of sellerRfqs) {
    assert.equal("source_text" in rfq, false, "RFQ cannot contain original source text at root");
    assert.ok(rfq.product_preferences.every((preference) => !("source_text" in preference)), "RFQ preferences must omit source text");
    assert.equal("max_total_twd" in rfq, false, "RFQ must not reveal private maximum budget");
  }
}

assert.equal(happy.negotiations.length, 3, "happy path must include three negotiation branches");
const finalDraftBySeller = new Map();
for (const negotiation of happy.negotiations) {
  assert.deepEqual(negotiation.rounds.map((round) => round.result.round), [1, 2], `${negotiation.seller_id} must negotiate twice`);
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
  finalDraftBySeller.set(negotiation.seller_id, negotiation.rounds[1].result.drafts[0]);
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
console.log("✓ happy path proves isolated two-round negotiation and safe independent ranking");

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
for (const example of [api.create_request, api.accept_decision, api.reject_decision_alternative, api.redeem]) {
  assert.ok(example.http.headers["Idempotency-Key"], `${example.http.method} ${example.http.path} needs Idempotency-Key`);
}
assert.equal(api.get_request.http.headers["Idempotency-Key"], undefined, "GET must not require Idempotency-Key");
assert.equal(api.redeem.body.total_price_twd, undefined, "redemption client must not submit a price");
console.log("✓ API examples preserve idempotency and server-authoritative redemption pricing");

console.log("\nAll A2A Commerce contract checks passed.");
