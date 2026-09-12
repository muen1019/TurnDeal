import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { applySalesProfiles } from '../scripts/lib/sales-profiles.mjs';
import { prepareDemoRequest } from '../scripts/lib/negotiation-demo.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';
import { SellerAgent, BuyerAgent } from '../src/negotiation/agents.mjs';
import { ModelGateway } from '../src/negotiation/model.mjs';
import { fixture, invocation, unavailableModel, NOW } from './helpers/negotiation.mjs';
import { evaluate } from '../src/evaluator/index.mjs';
import { validateDrafts } from '../src/negotiation/validation.mjs';

test('a clearance seller may choose different legal prices instead of a forced scheduled quote', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_a']).sellers[0];
  for (const price of [609, 619]) {
    const value = { outcome: 'offered', product_id: 'mouse_a_black_small', total_price_twd: price,
      include_bundle: false, is_final: false, message: '本輪價格', benefit_ids: [] };
    const gateway = new ModelGateway({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    }) }) });
    const answer = await new SellerAgent(seller, gateway).negotiate({ ...invocation(), rfq: fixture('seller_a').rfq });
    assert.equal(answer.provider, 'openai');
    assert.equal(answer.result.drafts[0].total_price_twd, price);
  }
});

export function setupPersonas(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  initializeDatabase(db); applySalesProfiles(db);
  const input = prepareDemoRequest(db);
  const repository = new NegotiationRepository(db);
  return { db, input, repository, run: options => negotiate({ ...input, repository, ...options }) };
}

test('five economic personas negotiate distinct concessions and stopping schedules', async t => {
  const { run, repository, input } = setupPersonas(t);
  const result = await run();
  const history = repository.history(input.requestId, input.buyerId).at(-1);
  const prices = id => history.offers.filter(o => o.seller_id === id && o.variant === 'standalone').map(o => o.total_price_twd);
  assert.deepEqual(prices('seller_a'), [609, 594, 579, 564, 549]);
  assert.deepEqual(prices('seller_b'), [799, 799, 799]);
  assert.deepEqual(prices('seller_d'), [709, 709, 709]);
  assert.deepEqual(prices('seller_e'), [899, 899, 899]);
  const c = result.offers.filter(o => o.seller_id === 'seller_c');
  assert.deepEqual(c.map(o => o.total_price_twd), [619,649]);
  assert.equal(c[1].eligibility.status, 'needs_confirmation');
  const loyalty = result.offers.find(o => o.seller_id === 'seller_d');
  assert.equal(loyalty.benefits.find(b => b.kind === 'future_coupon').amount_twd, 50);
  assert.equal(loyalty.benefits.find(b => b.kind === 'return_extension').duration_days, 30);
  assert.equal(result.offers.find(o => o.seller_id === 'seller_e').benefits.length, 3);
  assert.equal(result.offers.find(o => o.seller_id === 'seller_b').benefits.length, 2);
  assert.deepEqual(result.seller_agents.map(s => s.rounds.length), [5,3,3,3,3]);
});

test('unregistered coupon or cash-equivalent future coupon cannot be selected by the model', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_d']).sellers[0];
  const rfq = { ...fixture('seller_d').rfq, round: 2 };
  for (const mutation of [{ total_price_twd: 659 }, { benefit_ids: ['invented_coupon'] }]) {
    const value = { outcome: 'offered', product_id: rfq.candidate_product_ids[0], total_price_twd: 709,
      include_bundle: false, is_final: false, message: '折抵本次', benefit_ids: ['seller_d_future_coupon_v1'], ...mutation };
    const gateway = new ModelGateway({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    }) }) });
    const answer = await new SellerAgent(seller, gateway).negotiate({ ...invocation(), rfq });
    assert.equal(answer.provider, 'deterministic');
    assert.equal(answer.result.drafts[0].total_price_twd, 709);
    const benefit = answer.result.drafts[0].benefits[0];
    assert.equal(benefit.benefit_id, 'seller_d_future_coupon_v1');
    assert.equal(benefit.requires_membership, true);
    assert.match(benefit.conditions, /不可折現/);
  }
});

test('lost benefit inventory or modified evidence excludes a quote before evaluation', async t => {
  for (const corrupt of [db => db.exec("UPDATE seller_benefit_catalog SET available_units=0 WHERE seller_id='seller_d'"),
    db => db.exec("UPDATE seller_benefit_catalog SET evidence_json='{}' WHERE seller_id='seller_d'")]) {
    const { db, input, run } = setupPersonas(t);
    await run(); corrupt(db);
    const result = await evaluate({ db, requestId: input.requestId, buyerId: input.buyerId });
    assert.equal(result.solutions.length,4);
    assert.ok(!result.snapshot.offers.some(o => o.seller_id === 'seller_d'));
  }
});

test('logistics claims need matching capability and cannot promise faster than stocked delivery', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_b']).sellers[0];
  seller.products[0].delivery_days = 3;
  const rfq = { ...fixture('seller_b').rfq, round: 3 };
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq });
  assert.equal(answer.result.drafts[0].delivery_days, 3);
  assert.ok(!answer.result.drafts[0].benefits.some(b => b.kind === 'delivery_guarantee'));
});

test('clearance applies to designated SKU only, enforces small markdowns and short expiry', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_a']).sellers[0];
  const f = fixture('seller_a');
  const agent = new SellerAgent(seller, unavailableModel);
  const answer = await agent.negotiate({ ...invocation(), rfq: { ...f.rfq, target_total_twd: 1 } });
  assert.equal(answer.result.drafts[0].total_price_twd,609);
  assert.equal(Date.parse(answer.result.drafts[0].expires_at) - NOW,120000);
  const wrongSku = { ...f.rfq, candidate_product_ids: ['mouse_a_white_small'] };
  assert.equal((await agent.negotiate({ ...invocation(), rfq: wrongSku })).result.outcome, 'refused');
});

test('Backend rejects invented service terms even when the offer amount is valid', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_e']).sellers[0];
  const f = fixture('seller_e');
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq: f.rfq });
  answer.result.drafts[0].benefits[0].duration_days = 1095;
  const offers = validateDrafts({ ...f, seller, result: answer.result, now: NOW, idFactory: () => 'forged_service' });
  assert.equal(offers[0].eligibility.status, 'rejected');
});

test('Backend independently rejects combined costs exceeding budget or minimum contribution', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_e']).sellers[0];
  const f = fixture('seller_e');
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(), rfq:f.rfq });
  for (const change of [{ total_concession_budget_twd:0 }, { unit_cost_twd:890 }]) {
    const modified = structuredClone(seller);
    Object.assign(modified.products[0].negotiation_policy,change);
    assert.throws(() => validateDrafts({ ...f, seller:modified, result:structuredClone(answer.result), now:NOW, idFactory:()=> 'economic_bad' }), /proposal_policy_violation/);
  }
});

test('a free gift cannot bypass the complete offer cost budget', async t => {
  const { repository } = setupPersonas(t);
  const seller = repository.catalog(['seller_c']).sellers[0];
  const f = fixture('seller_c'); const rfq = {...f.rfq,round:2};
  const answer = await new SellerAgent(seller, unavailableModel).negotiate({ ...invocation(),rfq });
  seller.products.find(p=>p.category==='mouse').negotiation_policy.total_concession_budget_twd=60;
  let id=0;
  const offers=validateDrafts({...f,rfq,seller,result:answer.result,now:NOW,idFactory:()=>`cost_${id++}`});
  assert.equal(offers.find(o=>o.variant==='standalone').eligibility.status,'eligible');
  assert.equal(offers.find(o=>o.variant==='bundle').eligibility.status,'rejected');
});

test('exhausting the configured concession count stops the seller without further rounds', async t=> {
  const {run,repository,input,db}=setupPersonas(t);
  db.exec(`UPDATE seller_sku_policies SET policy_json=json_set(policy_json,'$.max_concession_count',1) WHERE seller_id='seller_a'`);
  const result=await run();
  const a=result.seller_agents.find(s=>s.seller_id==='seller_a');
  assert.equal(a.rounds.length,1);
  assert.equal(result.offers.find(o=>o.seller_id==='seller_a').total_price_twd,609);
  assert.equal(repository.history(input.requestId,input.buyerId).at(-1).traces.filter(t=>t.seller_id==='seller_a').length,1);
});

test('after-sales preference ranks actual verified rights and price-first still ranks price', async t=> {
  for(const priority of ['after_sales_first','price_first']) {
    const {db,run,input}=setupPersonas(t);
    db.prepare("UPDATE requests SET normalized_intent_json=json_set(normalized_intent_json,'$.preferences',json(?)) WHERE request_id=?")
      .run(JSON.stringify([priority]),input.requestId);
    await run();
    const result=await evaluate({db,requestId:input.requestId,buyerId:input.buyerId});
    assert.equal(result.solutions[0].seller_id,priority==='after_sales_first'?'seller_e':'seller_a');
  }
});

test('the model request requires a concrete proposal when the buyer is not allowed to stop', async ()=> {
  const f=fixture('seller_a');
  const gateway=new ModelGateway({apiKey:'test-key',fetchImpl:async (_url,options)=> {
    const schema=JSON.parse(options.body).text.format.schema;
    assert.equal(schema.properties.action.enum.length,1);
    assert.equal(schema.properties.proposal.type,'object');
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
      action:'negotiate',target_option_index:0,proposal:{kind:'lower_price',target_total_twd:null,reference_offer_id:null,benefit_kind:null}
    })}]}]})};
  }});
  const answer=await new BuyerAgent('seller_a',gateway).negotiate({...invocation(),requestId:f.rfq.request_id,round:2,intent:f.intent,
    branch:f.branch,seller:f.seller,context:{offers:[]},previous:[]});
  assert.equal(answer.provider,'openai');
  assert.equal(answer.rfq.proposal.kind,'lower_price');
});
