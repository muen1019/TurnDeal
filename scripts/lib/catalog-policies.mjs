import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { check } from '../../src/negotiation/contracts.mjs';
import { salesProfiles } from './sales-profiles.mjs';
export const catalogPolicies=JSON.parse(readFileSync(new URL('../../contracts/fixtures/catalog-negotiation-policies.json',import.meta.url),'utf8'));

// Additive, versioned backfill. Never restocks, reprices, or replaces a saved policy.
export function populateNegotiationCatalog(db,fixture=catalogPolicies) {
  const hash=createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
  const old=db.prepare('SELECT content_hash FROM seller_policy_seeds WHERE version=?').get(fixture.version);
  if(old){if(old.content_hash!==hash)throw new Error('policy_seed_changed_use_new_version');return;}
  if(fixture.data_origin!=='synthetic')throw new Error('unsupported_policy_source');
  for(const s of fixture.sellers){
    check('SellerPersonaPolicy',s.persona_policy);
    for(const p of s.products){
      check('SellerSkuPolicy',p.policy);
      check('ProductAttributes',p.attributes);
      if(p.product_id!==p.policy.product_id || !p.price_includes_tax || !Number.isInteger(p.shipping_twd) ||
        p.list_price_twd!==p.item_price_twd+p.shipping_twd || p.floor_price_twd>p.list_price_twd)throw new Error('invalid_catalog_policy');
      if(p.category==='mouse' && !s.persona_policy.sku_ids.includes(p.product_id))throw new Error('missing_persona_scope');
      for(const a of p.policy.addon_costs){
        const addon=s.products.find(x=>x.product_id===a.product_id && x.category==='mouse_pad');
        if(!addon || a.cost_twd<addon.policy.unit_cost_twd || a.cost_twd>p.policy.gift_cost_budget_twd)throw new Error('invalid_addon_policy');
      }
      if(p.category==='mouse' && s.persona_policy.benefit_schedule.some(({benefit:b})=>!p.policy.benefit_costs.some(c=>c.benefit_id===b.benefit_id && c.cost_twd>=b.amount_twd)))throw new Error('invalid_benefit_cost');
    }
  }
  for(const e of fixture.canonical_extensions)check('SellerSkuPolicy',e.policy);
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const profile of salesProfiles){
      const p=profile.persona_policy;
      const added=db.prepare('INSERT OR IGNORE INTO seller_persona_policies VALUES(?,?)').run(profile.seller_id,JSON.stringify(p));
      if(added.changes)db.prepare('UPDATE sellers SET round_discounts_json=?,final_round=?,bundle_discount_twd=?,always_offer_bundle=?,gift_exchange_discount_twd=? WHERE seller_id=?')
        .run(JSON.stringify(p.round_discounts_twd),p.final_round,profile.bundle_discount_twd,Number(profile.always_offer_bundle),profile.gift_exchange_discount_twd,profile.seller_id);
      for(const sku of profile.sku_policies)db.prepare('INSERT OR IGNORE INTO seller_sku_policies VALUES(?,?,?)').run(profile.seller_id,sku.product_id,JSON.stringify(sku));
      for(const {benefit:b} of p.benefit_schedule){
        const evidence={evidence_id:b.evidence_id,seller_id:profile.seller_id,kind:b.kind,mode:'simulation',product_ids:p.sku_ids,definition:b};
        db.prepare('INSERT OR IGNORE INTO seller_benefit_catalog VALUES(?,?,?,?,?,1,100)').run(b.benefit_id,profile.seller_id,JSON.stringify(b),b.evidence_id,JSON.stringify(evidence));
      }
    }
    for(const s of fixture.sellers){
      // A colliding merchant must be reviewed, never silently assigned a new strategy.
      if(db.prepare('SELECT 1 FROM sellers WHERE seller_id=?').get(s.seller_id))throw new Error('catalog_seller_collision');
      const p=s.persona_policy;
      db.prepare(`INSERT INTO sellers(seller_id,name,enabled,strategy_type,round_discounts_json,final_round,bundle_mode,
        personal_band,personal_rating,personal_count,marketplace_rating,marketplace_count,bundle_discount_twd,always_offer_bundle,gift_exchange_discount_twd)
        VALUES(?,?,?,?,?,?,?,'neutral',NULL,0,?,?,?,?,?)`).run(s.seller_id,s.name,Number(s.enabled),s.strategy_type,
        JSON.stringify(p.round_discounts_twd),p.final_round,s.always_offer_bundle?'free_optional_mouse_pad':'none',s.rating,s.rating_count,
        s.bundle_discount_twd,Number(s.always_offer_bundle),s.gift_exchange_discount_twd);
      db.prepare('INSERT INTO seller_persona_policies VALUES(?,?)').run(s.seller_id,JSON.stringify(p));
      for(const item of s.products){
        db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?)').run(item.product_id,item.category,item.brand,item.model,item.name,
          JSON.stringify(item.features),JSON.stringify(item.attributes),item.item_price_twd);
        for(const id of item.source_ids)db.prepare('INSERT INTO product_sources VALUES(?,?)').run(item.product_id,id);
        db.prepare('INSERT INTO seller_inventory VALUES(?,?,?,?,?,?,?,?)').run(s.seller_id,item.product_id,item.list_price_twd,item.floor_price_twd,
          item.stock,item.delivery_days,item.terms_id,new Date().toISOString());
        db.prepare('INSERT INTO seller_sku_policies VALUES(?,?,?)').run(s.seller_id,item.product_id,JSON.stringify(item.policy));
        db.prepare('INSERT INTO seller_listing_bindings VALUES(?,?,?,?,?)').run(fixture.source_snapshot_id,item.listing_id,s.seller_id,item.source_product_id,item.product_id);
      }
      for(const {benefit:b} of p.benefit_schedule){
        const evidence={evidence_id:b.evidence_id,seller_id:s.seller_id,kind:b.kind,mode:'simulation',product_ids:p.sku_ids,definition:b};
        db.prepare('INSERT INTO seller_benefit_catalog VALUES(?,?,?,?,?,1,100)').run(b.benefit_id,s.seller_id,JSON.stringify(b),b.evidence_id,JSON.stringify(evidence));
      }
    }
    for(const e of fixture.canonical_extensions){
      db.prepare('INSERT OR IGNORE INTO seller_sku_policies VALUES(?,?,?)').run(e.seller_id,e.policy.product_id,JSON.stringify(e.policy));
      // Existing Persona scope remains explicit: adding a policy does not enroll a
      // different color into a clearance campaign or invent service evidence.
    }
    db.prepare('INSERT INTO seller_policy_seeds VALUES(?,?,?)').run(fixture.version,hash,new Date().toISOString());
    db.exec('COMMIT');
  } catch(error){db.exec('ROLLBACK');throw error;}
}
