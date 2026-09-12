import { randomUUID } from 'node:crypto';
import { createOrchestratorDataTools } from '../../src/orchestrator/data-tools.ts';
import { createOrchestratorHandoff } from '../../src/orchestrator/handoff.ts';

// Register only sellers with persisted bounded policies. Persona is metadata;
// selection scores use public prices and verified public services.
export function prepareConfiguredHandoff(db, buyerId, requestId, target, now) {
  const policies=new Map(db.prepare('SELECT seller_id,policy_json FROM seller_persona_policies').all().map(r=>[r.seller_id,JSON.parse(r.policy_json)]));
  const ids = [...policies.keys()];
  const data = createOrchestratorDataTools({db,userId:buyerId,registeredSellerIds:ids})
    .load_discovery_input({request_id:requestId,now:now.toISOString()});
  const snapshotId = `configured_${randomUUID()}`;
  const catalog = {
    snapshot_id:snapshotId,source_snapshot_id:'configured_catalog_sqlite_v1',
    sellers:data.sellers.map(s=>{const trust=data.seller_trust.find(t=>t.seller_id===s.seller_id).trust;return {
      seller_id:s.seller_id,name:s.name,platform:'demo',rating:trust.marketplace_rating,
      rating_count:trust.marketplace_count,enabled:s.enabled,persona:s.persona,data_origin:'synthetic'};}),
    listings:data.catalog.filter(p=>p.category==='mouse_pad'||policies.get(p.seller_id)?.sku_ids.includes(p.product_id)).map(p=>({listing_id:`${p.seller_id}:${p.product_id}`,product_id:p.product_id,
      seller_id:p.seller_id,name:p.name,category:p.category,features:p.features,attributes:p.attributes,
      item_price_twd:p.list_price_twd,shipping_twd:0,price_includes_tax:true,rating:null,rating_count:0,
      stock:p.stock,delivery_days:p.delivery_days,source_ids:p.source_ids,public_services:p.public_services,data_origin:'synthetic',synthetic_fields:[]})),
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
