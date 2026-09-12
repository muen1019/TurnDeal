// Maintainer command only. The runtime reads the reviewed, checked-in result.
import { readFileSync, writeFileSync } from 'node:fs';
import { salesProfiles } from './lib/sales-profiles.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const discovery=read('../contracts/fixtures/discovery-catalog.json');
const canonical=read('../contracts/fixtures/sellers.json');
const clone=structuredClone;
const unitCost=p=>Math.floor(p.item_price_twd*0.45);
const sellers=discovery.sellers.map((s,i)=>{
  const template=clone(salesProfiles[i%5]),persona=template.persona_policy;
  const listings=discovery.listings.filter(p=>p.seller_id===s.seller_id);
  const mice=listings.filter(p=>p.category==='mouse');
  const pads=listings.filter(p=>p.category==='mouse_pad');
  const sku=p=>`sku_${p.listing_id}`;
  persona.sku_ids=mice.map(sku);
  persona.base_price_twd=mice[0].item_price_twd+mice[0].shipping_twd;
  persona.objective=template.description=persona.objective.replace('指定黑色 SKU','指定庫存 SKU').replace('一天到貨','登錄交期到貨');
  for(const entry of persona.benefit_schedule){
    const b=entry.benefit;
    b.benefit_id=b.benefit_id.replace(template.seller_id,s.seller_id);
    b.evidence_id=`sim_${b.benefit_id}`;
    if(b.kind==='delivery_guarantee'){
      b.duration_days=Math.max(...mice.map(p=>p.delivery_days));
      b.description=`${b.duration_days} 天內到貨承諾`;
      b.conditions=`模擬標準配送區；付款後 ${b.duration_days} 天內到貨，個別 SKU 的公開交期仍以庫存紀錄為準；非真實商家承諾。`;
    }
  }
  const products=listings.map(p=>{
    const mouse=p.category==='mouse',base=p.item_price_twd+p.shipping_twd;
    const policy=clone(template.sku_policies[0]);
    policy.product_id=sku(p);policy.policy_version='catalog-synthetic-v1';
    policy.unit_cost_twd=unitCost(p);policy.shipping_cost_twd=p.shipping_twd;
    policy.inventory_pressure=p.stock>=15?'high':p.stock<=3?'low':'normal';
    policy.benefit_costs=mouse?persona.benefit_schedule.map(({benefit:b})=>({benefit_id:b.benefit_id,cost_twd:Math.max(10,b.amount_twd)})):[];
    policy.addon_costs=mouse && persona.persona==='bundle_curator'?pads.map(a=>({product_id:sku(a),cost_twd:unitCost(a)})):[];
    policy.gift_cost_budget_twd=Math.max(0,...policy.addon_costs.map(a=>a.cost_twd));
    policy.total_concession_budget_twd=mouse?Math.max(policy.total_concession_budget_twd,policy.max_total_discount_twd+policy.gift_cost_budget_twd+policy.benefit_costs.reduce((n,b)=>n+b.cost_twd,0)):0;
    if(!mouse){for(const key of ['opening_discount_cap_twd','max_discount_per_step_twd','max_total_discount_twd','max_concession_count','gift_exchange_discount_cap_twd','voucher_budget_twd'])policy[key]=0;}
    // Clearance discounts apply only to inventory with pressure, never invented stock.
    if(mouse && persona.persona==='price_optimizer' && policy.inventory_pressure!=='high'){
      policy.opening_discount_cap_twd=0;policy.max_discount_per_step_twd=0;policy.max_total_discount_twd=0;
    }
    return {...p,attributes:{size_class:null,color:null,shape:null,length_mm:null,width_mm:null,height_mm:null,...p.attributes},
      model:p.name.startsWith(p.brand+' ')?p.name.slice(p.brand.length+1):p.name,product_id:sku(p),source_product_id:p.product_id,list_price_twd:base,
      floor_price_twd:Math.ceil(base*0.8),terms_id:'terms_standard_v1',policy};
  });
  return {...s,strategy_type:['lowest_price_slow_delivery','premium_fast_delivery','value_bundle','balanced_delivery','firm_price'][i%5],
    bundle_discount_twd:template.bundle_discount_twd,always_offer_bundle:template.always_offer_bundle,
    gift_exchange_discount_twd:template.gift_exchange_discount_twd,persona_policy:persona,products};
});
const canonical_extensions=canonical.sellers.flatMap(s=>s.products.filter(p=>!salesProfiles.find(t=>t.seller_id===s.seller_id).sku_policies.some(k=>k.product_id===p.product_id)).map(p=>{
  const template=salesProfiles.find(t=>t.seller_id===s.seller_id),policy=clone(template.sku_policies[0]);
  policy.product_id=p.product_id;policy.policy_version='catalog-synthetic-v1';
  // Non-campaign variants are configured but cannot inherit another color's discount.
  for(const k of ['opening_discount_cap_twd','max_discount_per_step_twd','max_total_discount_twd','gift_exchange_discount_cap_twd'])policy[k]=0;
  if(p.category==='mouse_pad'){
    policy.unit_cost_twd=35;policy.shipping_cost_twd=0;policy.max_concession_count=0;
    policy.gift_cost_budget_twd=0;policy.total_concession_budget_twd=0;policy.voucher_budget_twd=0;
    policy.addon_costs=[];policy.benefit_costs=[];
  }
  return {seller_id:s.seller_id,category:p.category,policy};
}));
const fixture={version:'catalog-synthetic-v1',source_snapshot_id:discovery.snapshot_id,
  data_origin:'synthetic',notice:'All commercial costs, floors, Personas and benefit evidence are synthetic demo settings, not scraped supplier terms. Original listing prices, stock, delivery and variant attributes are preserved.',
  sellers,canonical_extensions};
writeFileSync(new URL('../contracts/fixtures/catalog-negotiation-policies.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
console.log(`Generated ${sellers.length} sellers / ${sellers.flatMap(s=>s.products).length} listing policies + ${canonical_extensions.length} canonical extensions`);
