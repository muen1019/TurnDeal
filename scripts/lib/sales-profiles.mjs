import { readFileSync } from 'node:fs';
import { check } from '../../src/negotiation/contracts.mjs';

export const salesProfiles = JSON.parse(readFileSync(new URL('../../contracts/fixtures/sales-profiles.json', import.meta.url), 'utf8')).profiles;

// Demo/test setup only, before publishing a Request. Product IDs are catalog IDs;
// D offers the same sourced mouse pad with its own inventory and delivery policy.
export function applySalesProfiles(db, profiles = salesProfiles) {
  profiles.forEach(p => check('SellerSalesProfile', p));
  if (new Set(profiles.map(p => p.seller_id)).size !== profiles.length) throw new Error('duplicate_sales_profile');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const p of profiles) {
      const changed = db.prepare(`UPDATE sellers SET bundle_discount_twd = ?, always_offer_bundle = ?, bundle_mode = ? WHERE seller_id = ?`)
        .run(p.bundle_discount_twd, Number(p.always_offer_bundle), p.addon_product_id ? 'free_optional_mouse_pad' : 'none', p.seller_id);
      if (changed.changes !== 1) throw new Error('unknown_seller_profile');
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
