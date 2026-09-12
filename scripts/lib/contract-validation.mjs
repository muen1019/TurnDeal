import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(readFileSync(new URL("../../contracts/a2a-commerce.v0.2.schema.json", import.meta.url), "utf8"));
// Existing conditional schemas intentionally constrain properties without repeating type.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);

export function validateContract(definition, value) {
  const validate = ajv.getSchema(`${schema.$id}#/$defs/${definition}`);
  assert.ok(validate, `Unknown contract definition: ${definition}`);
  assert.ok(validate(value), `${definition}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
}

export function validateSellerList(sellers, placement = null) {
  assert.ok(sellers.length <= 5, "At most five Seller branches are allowed");
  assert.equal(new Set(sellers.map(s => s.seller_id)).size, sellers.length, "Seller IDs must be unique");
  assert.deepEqual(sellers.map(s => s.listing_rank), sellers.map((_, i) => i + 1), "Listing ranks must be contiguous");
  if (placement) assert.ok(sellers.some(s => s.seller_id === placement.seller_id), "Sponsored Seller must already be selected");
  for (const seller of sellers) {
    validateContract("SellerAgent", seller);
    assert.deepEqual(seller.rounds.map(r => r.round), seller.rounds.map((_, i) => i + 1), "Branch rounds must be contiguous and unique");
    const last = seller.rounds.at(-1);
    for (const round of seller.rounds.slice(0, -1)) {
      assert.equal(round.outcome, "offered", "A failed branch cannot receive another round");
      assert.equal(round.is_final, false, "A final branch cannot receive another round");
    }
    for (const round of seller.rounds) {
      if (round.outcome !== "offered") {
        assert.equal(round.is_final, false, "Only an offered result can be final");
        assert.equal(round.offer_ids.length, 0, "Failed rounds cannot introduce offers");
      } else assert.ok(round.offer_ids.length > 0, "An offered round needs validated offers");
    }
    if (last?.is_final) assert.equal(seller.stop_reason, "seller_final");
    if (seller.stop_reason === "seller_final") assert.equal(last?.is_final, true);
    if (last && last.outcome !== "offered") {
      assert.equal(seller.stop_reason, last.outcome);
      assert.equal(seller.status, last.outcome);
    }
    if (["refused", "timeout", "error"].includes(seller.stop_reason)) assert.equal(last?.outcome, seller.stop_reason);
    if (seller.stop_reason === "max_rounds") assert.equal(last?.round, 5, "max_rounds requires completed round five");
    if (["refused", "timeout", "error"].includes(seller.status)) assert.equal(seller.stop_reason, seller.status);
    if (last?.round === 5) assert.notEqual(seller.stop_reason, null, "The fifth round must close the branch");
    if (["pending", "negotiating"].includes(seller.status)) assert.equal(seller.stop_reason, null);
    const historicalIds = new Set(seller.rounds.flatMap(r => r.offer_ids));
    assert.ok(seller.final_offer_ids.every(id => historicalIds.has(id)), "Final IDs must belong to this branch's validated history");
  }
}

// Validates the recorded contract exchange, not a live negotiation scheduler.
export function validateNegotiationTrace(happy) {
  validateContract("OrchestrationResult", happy.orchestration);
  validateSellerList(happy.orchestration.seller_agents, happy.orchestration.sponsored_placement);
  assert.equal(happy.negotiations.length, happy.orchestration.seller_agents.length);
  assert.equal(new Set(happy.negotiations.map(n => n.seller_id)).size, happy.negotiations.length);
  const rfqKeys = happy.rfqs.map(q => `${q.seller_id}/${q.round}`);
  assert.equal(new Set(rfqKeys).size, rfqKeys.length, "Duplicate RFQ dispatch");
  const resultKeys = [];
  for (const branch of happy.negotiations) {
    const seller = happy.orchestration.seller_agents.find(s => s.seller_id === branch.seller_id);
    assert.ok(seller, "An unselected Seller cannot negotiate");
    assert.equal(branch.rounds.length, seller.rounds.length);
    branch.rounds.forEach(({ result }, index) => {
      validateContract("SellerNegotiationResult", result);
      const round = seller.rounds[index];
      assert.equal(result.seller_id, seller.seller_id);
      assert.equal(result.round, round.round);
      assert.equal(result.outcome, round.outcome);
      assert.equal(result.is_final, round.is_final);
      assert.equal(result.drafts.length, round.offer_ids.length);
      const rfq = happy.rfqs.find(q => q.seller_id === seller.seller_id && q.round === round.round);
      assert.ok(rfq, "Each result needs a matching dispatched RFQ");
      validateContract("SellerRFQ", rfq);
      assert.equal(rfq.request_id, happy.snapshot.request_id);
      assert.equal(result.request_id, rfq.request_id);
      assert.deepEqual(rfq.previous_offer_ids, index === 0 ? [] : seller.rounds[index - 1].offer_ids);
      assert.ok(rfq.candidate_product_ids.every(id => seller.candidate_products.some(p => p.product_id === id)));
      resultKeys.push(`${seller.seller_id}/${round.round}`);
    });
  }
  assert.deepEqual(resultKeys.sort(), rfqKeys.sort(), "Every dispatch must have one recorded outcome");
}
