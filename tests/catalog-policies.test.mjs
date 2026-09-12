import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { applySalesProfiles } from '../scripts/lib/sales-profiles.mjs';
import { populateNegotiationCatalog,catalogPolicies } from '../scripts/lib/catalog-policies.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { RuntimeStore } from '../backend/runtime/store.mjs';
import { SellerAgent } from '../src/negotiation/agents.mjs';
import { ModelGateway } from '../src/negotiation/model.mjs';
import { fixture, invocation } from './helpers/negotiation.mjs';

test('all catalog sellers and variants load with bounded policies without replacing existing prices or stock', t => {
  const db = new DatabaseSync(':memory:');t.after(()=>db.close());
  initializeDatabase(db);applySalesProfiles(db);
  const before=db.prepare('SELECT * FROM seller_inventory').all();
  const snapshots=db.prepare('SELECT request_id,published_snapshot_json FROM requests').all();
  populateNegotiationCatalog(db);
  const ids=db.prepare('SELECT seller_id FROM sellers').all().map(s=>s.seller_id);
  const catalog=new NegotiationRepository(db).catalog(ids);
  assert.equal(catalog.sellers.length,20);
  assert.equal(catalog.sellers.flatMap(s=>s.products).length,129);
  for(const seller of catalog.sellers) {
    assert.ok(seller.strategy.persona);
    for(const p of seller.products) {
      assert.ok(p.negotiation_policy,p.product_id);
      assert.equal(p.negotiation_policy.product_id,p.product_id);
      assert.ok(p.floor_price_twd<=p.list_price_twd);
    }
  }
  assert.deepEqual(db.prepare("SELECT * FROM seller_inventory WHERE seller_id LIKE 'seller_%'").all(),before);
  const product=catalog.sellers.find(s=>s.seller_id==='discovery_seller_01').products.find(p=>p.product_id==='sku_listing_001');
  assert.equal(product.list_price_twd,599);assert.equal(product.stock,0);
  assert.equal(product.attributes.color,'black');
  db.prepare("UPDATE seller_inventory SET stock=1 WHERE product_id='sku_listing_002'").run();
  db.prepare('UPDATE seller_benefit_catalog SET available_units=3').run();
  populateNegotiationCatalog(db);
  assert.equal(db.prepare("SELECT stock FROM seller_inventory WHERE product_id='sku_listing_002'").get().stock,1);
  assert.ok(db.prepare('SELECT available_units FROM seller_benefit_catalog').all().every(b=>b.available_units===3));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.deepEqual(db.prepare('SELECT request_id,published_snapshot_json FROM requests').all(),snapshots);
  const changed=structuredClone(catalogPolicies);changed.sellers[0].persona_policy.objective='changed';
  assert.throws(()=>populateNegotiationCatalog(db,changed),/policy_seed_changed/);
});

test('bundle seller chooses an eligible in-stock pad when the first pad cannot meet delivery',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());initializeDatabase(db);applySalesProfiles(db);populateNegotiationCatalog(db);
  const seller=new NegotiationRepository(db).catalog(['discovery_seller_03']).sellers[0];
  const product=seller.products.find(p=>p.category==='mouse');product.stock=5;product.delivery_days=2;
  const pads=seller.products.filter(p=>p.category==='mouse_pad');pads[0].stock=5;pads[0].delivery_days=9;pads[1].stock=5;pads[1].delivery_days=1;
  const rfq={...fixture('seller_c').rfq,seller_id:seller.seller_id,round:2,candidate_product_ids:[product.product_id],
    required_features:['wireless'],product_preferences:[],proposal:{kind:'add_gift',variant:'bundle',target_total_twd:null,reference_offer_id:null}};
  const {result}=await new SellerAgent(seller,new ModelGateway()).negotiate({...invocation(),rfq});
  assert.equal(result.outcome,'offered');
  assert.equal(result.drafts.find(d=>d.variant==='bundle')?.items[1].product_id,pads[1].product_id);
});

test('full runtime naturally selects configured discovery sellers and ranks five validated solutions by preference',async()=>{
  const store=new RuntimeStore();
  try {
    store.ensureBuyer('catalog_buyer');
    for(const preference of ['價格優先，可接受免費滑鼠墊，不接受付費加購。','售後優先，可接受免費滑鼠墊，不接受付費加購。']) {
      const created=store.create('catalog_buyer',{intent_md:'買一個無線滑鼠，預算1500元含稅運，7天內到貨。',preference_md:preference});
      await store.process(created.body.request_id,'catalog_buyer');
      const result=store.snapshot(created.body.request_id,'catalog_buyer');
      assert.equal(result.status,'awaiting_user',JSON.stringify(result.error));
      assert.equal(result.seller_agents.length,5);
      assert.ok(result.seller_agents.some(s=>s.seller_id.startsWith('discovery_seller_')));
      assert.equal(new Set(result.ranked_offers.map(r=>result.offers.find(o=>o.offer_id===r.offer_id).seller_id)).size,5);
      assert.ok(result.seller_agents.every(s=>s.rounds.length>0));
      for(const r of result.ranked_offers)assert.equal(result.offers.find(o=>o.offer_id===r.offer_id).eligibility.status,'eligible');
      const ranked=result.ranked_offers.map(r=>result.offers.find(o=>o.offer_id===r.offer_id));
      if(preference.startsWith('價格'))assert.equal(ranked[0].total_price_twd,Math.min(...ranked.map(o=>o.total_price_twd)));
      else assert.ok(ranked[0].benefits.some(b=>b.kind==='warranty_extension' && b.duration_days===730));
      const output=JSON.stringify(result);
      for(const field of ['unit_cost_twd','price_floor','floor_price_twd','inventory_pressure','policy_json'])assert.ok(!output.includes(field));
    }
  } finally {await store.close();}
});
