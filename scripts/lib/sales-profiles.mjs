import { readFileSync } from 'node:fs';
import { check } from '../../src/negotiation/contracts.mjs';

export const salesProfiles = JSON.parse(readFileSync(new URL('../../contracts/fixtures/sales-profiles.json', import.meta.url), 'utf8')).profiles;

// Demo/test setup only, before publishing a Request. Product IDs are catalog IDs;
// Persona is assigned before discovery, never according to selection rank.
export function applySalesProfiles(db, profiles = salesProfiles) {
  profiles.forEach(p => {
    check('SellerSalesProfile', p);
    if (p.persona_policy) {
      const policy = p.persona_policy;
      if (policy.round_discounts_twd.some((d, i, a) => i && d < a[i-1]) ||
        policy.benefit_schedule.some(b => b.from_round > policy.final_round)) throw new Error('invalid_persona_schedule');
      if (policy.decision_mode === 'bounded' && (!p.sku_policies || policy.sku_ids.some(id =>
        p.sku_policies.filter(s => s.product_id === id).length !== 1))) throw new Error('missing_sku_policy');
    }
  });
  if (new Set(profiles.map(p => p.seller_id)).size !== profiles.length) throw new Error('duplicate_sales_profile');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const p of profiles) {
      const changed = db.prepare(`UPDATE sellers SET bundle_discount_twd = ?, always_offer_bundle = ?, bundle_mode = ?, gift_exchange_discount_twd = ? WHERE seller_id = ?`)
        .run(p.bundle_discount_twd, Number(p.always_offer_bundle), p.addon_product_id ? 'free_optional_mouse_pad' : 'none', p.gift_exchange_discount_twd ?? 0, p.seller_id);
      if (changed.changes !== 1) throw new Error('unknown_seller_profile');
      if (p.persona_policy) {
        const policy = p.persona_policy;
        for (const sku of policy.sku_ids) {
          const inventory = db.prepare('SELECT * FROM seller_inventory WHERE seller_id=? AND product_id=?').get(p.seller_id, sku);
          if (!inventory || policy.base_price_twd - Math.max(...policy.round_discounts_twd) < inventory.floor_price_twd) throw new Error('invalid_persona_inventory');
          db.prepare('UPDATE seller_inventory SET list_price_twd=? WHERE seller_id=? AND product_id=?').run(policy.base_price_twd, p.seller_id, sku);
        }
        db.prepare(`INSERT INTO seller_persona_policies VALUES (?,?) ON CONFLICT(seller_id) DO UPDATE SET policy_json=excluded.policy_json`)
          .run(p.seller_id, JSON.stringify(policy));
        db.prepare('UPDATE sellers SET round_discounts_json=?,final_round=? WHERE seller_id=?')
          .run(JSON.stringify(policy.round_discounts_twd), policy.final_round, p.seller_id);
        for (const sku of p.sku_policies ?? []) {
          if (!policy.sku_ids.includes(sku.product_id) || sku.gift_exchange_discount_cap_twd > (p.gift_exchange_discount_twd ?? 0) ||
            new Set(sku.addon_costs.map(a => a.product_id)).size !== sku.addon_costs.length ||
            new Set(sku.benefit_costs.map(b => b.benefit_id)).size !== sku.benefit_costs.length ||
            policy.benefit_schedule.some(b => !sku.benefit_costs.some(c => c.benefit_id === b.benefit.benefit_id && c.cost_twd >= b.benefit.amount_twd)))
            throw new Error('invalid_sku_policy');
          db.prepare(`INSERT INTO seller_sku_policies VALUES (?,?,?) ON CONFLICT(seller_id,product_id) DO UPDATE SET policy_json=excluded.policy_json`)
            .run(p.seller_id, sku.product_id, JSON.stringify(sku));
        }
        db.prepare('UPDATE seller_benefit_catalog SET enabled=0 WHERE seller_id=?').run(p.seller_id);
        for (const { benefit } of policy.benefit_schedule) {
          const evidence = { evidence_id: benefit.evidence_id, seller_id: p.seller_id, kind: benefit.kind,
            mode: 'simulation', product_ids: policy.sku_ids, definition: benefit };
          db.prepare(`INSERT INTO seller_benefit_catalog VALUES (?,?,?,?,?,1,100)
            ON CONFLICT(benefit_id) DO UPDATE SET definition_json=excluded.definition_json,evidence_id=excluded.evidence_id,evidence_json=excluded.evidence_json,enabled=1`)
            .run(benefit.benefit_id, p.seller_id, JSON.stringify(benefit), benefit.evidence_id, JSON.stringify(evidence));
        }
      }
      if (p.addon_product_id) {
        const pad = db.prepare(`SELECT i.* FROM seller_inventory i JOIN products p ON p.product_id = i.product_id
          WHERE i.product_id = ? AND p.category = 'mouse_pad' ORDER BY i.seller_id LIMIT 1`).get(p.addon_product_id);
        if (!pad) throw new Error('unknown_profile_addon');
        const mouse = db.prepare(`SELECT i.* FROM seller_inventory i JOIN products p ON p.product_id = i.product_id
          WHERE i.seller_id = ? AND p.category = 'mouse' ORDER BY i.product_id LIMIT 1`).get(p.seller_id);
        db.prepare(`INSERT INTO seller_inventory (seller_id, product_id, list_price_twd, floor_price_twd, stock, delivery_days, terms_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(seller_id, product_id) DO NOTHING`)
          .run(p.seller_id, p.addon_product_id, pad.list_price_twd, pad.floor_price_twd, 15, mouse.delivery_days, mouse.terms_id, new Date().toISOString());
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
