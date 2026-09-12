import { randomUUID } from 'node:crypto';
import { createOrchestratorDataTools } from '../../src/orchestrator/data-tools.ts';
import { createOrchestratorHandoff } from '../../src/orchestrator/handoff.ts';

// Production composition of the existing Discovery API, scoped to configured
// canonical sellers. The 15 discovery_seller_* draft policies remain inactive.
export function prepareConfiguredHandoff(db, buyerId, requestId, target, now) {
  const ids = ['seller_a', 'seller_b', 'seller_c', 'seller_d', 'seller_e'];
  const data = createOrchestratorDataTools({db,userId:buyerId,registeredSellerIds:ids})
    .load_discovery_input({request_id:requestId,now:now.toISOString()});
  const snapshotId = `configured_${randomUUID()}`;
  const catalog = {
    snapshot_id:snapshotId,source_snapshot_id:'configured_canonical_sqlite',
    sellers:data.sellers.map(s=>{const trust=data.seller_trust.find(t=>t.seller_id===s.seller_id).trust;return {
      seller_id:s.seller_id,name:s.name,platform:'demo',rating:trust.marketplace_rating,
      rating_count:trust.marketplace_count,enabled:s.enabled,data_origin:'deterministic_fixture'};}),
    listings:data.catalog.map(p=>({listing_id:`${p.seller_id}:${p.product_id}`,product_id:p.product_id,
      seller_id:p.seller_id,name:p.name,category:p.category,features:p.features,attributes:p.attributes,
      item_price_twd:p.list_price_twd,shipping_twd:0,price_includes_tax:true,rating:null,rating_count:0,
      stock:p.stock,delivery_days:p.delivery_days,source_ids:p.source_ids,data_origin:'deterministic_fixture',synthetic_fields:[]})),
    campaigns:data.campaigns.map(c=>({campaign_id:c.campaign_id,seller_id:c.seller_id,category:c.target_category,
      bid_twd:c.bid_twd,enabled:true,starts_at:c.starts_at,ends_at:c.ends_at})),
  };
  db.prepare('INSERT INTO discovery_catalogs VALUES (?,?,?,?)').run(snapshotId,catalog.source_snapshot_id,JSON.stringify(catalog),now.toISOString());
  // The full-round manager dispatches SellerAgent directly. Never run the
  // first-round-only dispatcher too (it would call/pay round one twice).
  const registrations=ids.map(seller_id=>({seller_id,snapshot_id:snapshotId,
    handle:async()=>{throw new Error('full_round_manager_owns_dispatch');}}));
  return createOrchestratorHandoff({db,userId:buyerId,registrations,timeoutMs:30000,now:()=>now})
    .prepare({request_id:requestId,snapshot_id:snapshotId,idempotency_key:`runtime:${requestId}`,
      ...(target===null?{}:{target_total_twd:target})});
}
