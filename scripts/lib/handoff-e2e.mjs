import { randomUUID } from 'node:crypto';
import { demoFixture } from './negotiation-demo.mjs';
import { salesProfiles } from './sales-profiles.mjs';
import { createOrchestratorDataTools } from '../../src/orchestrator/data-tools.ts';
import { createOrchestratorHandoff } from '../../src/orchestrator/handoff.ts';
import { NegotiationRepository } from '../../src/negotiation/repository.mjs';
import { SellerAgent } from '../../src/negotiation/agents.mjs';
import { ModelGateway } from '../../src/negotiation/model.mjs';

// E2E-only composition, using the upstream prepare API unchanged. The canonical
// configured Seller IDs remain canonical; draft discovery_seller_* policies are not enabled.
export function prepareHandoffE2E(db) {
  const requestId = `req_${randomUUID()}`, buyerId = 'user_demo_001', now = new Date().toISOString();
  const docs = demoFixture.request.documents;
  db.prepare(`INSERT INTO requests (request_id,user_id,revision,intent_md,preference_md,normalized_intent_json,status,created_at,updated_at)
    VALUES (?,?,1,?,?,?,'orchestrating',?,?)`).run(requestId,buyerId,docs.intent_md,docs.preference_md,
      JSON.stringify(demoFixture.request.normalized_intent),now,now);
  const ids = salesProfiles.map(s => s.seller_id);
  const data = createOrchestratorDataTools({ db, userId: buyerId, registeredSellerIds: ids })
    .load_discovery_input({ request_id: requestId, now });
  const snapshotId = `canonical_${randomUUID()}`;
  const catalog = { snapshot_id: snapshotId, source_snapshot_id: 'canonical_sqlite_fixture',
    sellers: data.sellers.map(s => {
      const t = data.seller_trust.find(t => t.seller_id === s.seller_id).trust;
      return { seller_id: s.seller_id, name: s.name, platform: 'demo', rating: t.marketplace_rating,
        rating_count: t.marketplace_count, enabled: s.enabled, data_origin: 'deterministic_fixture' };
    }), listings: data.catalog.map(p => ({ listing_id: `${p.seller_id}:${p.product_id}`, product_id: p.product_id,
      seller_id: p.seller_id, name: p.name, category: p.category, features: p.features, attributes: p.attributes,
      item_price_twd: p.list_price_twd, shipping_twd: 0, price_includes_tax: true, rating: null, rating_count: 0,
      stock: p.stock, delivery_days: p.delivery_days, source_ids: p.source_ids, data_origin: 'deterministic_fixture', synthetic_fields: [] })),
    campaigns: data.campaigns.map(c => ({ campaign_id: c.campaign_id, seller_id: c.seller_id, category: c.target_category,
      bid_twd: c.bid_twd, enabled: true, starts_at: c.starts_at, ends_at: c.ends_at })) };
  db.prepare('INSERT INTO discovery_catalogs VALUES (?,?,?,?)').run(snapshotId,catalog.source_snapshot_id,JSON.stringify(catalog),now);
  const privateCatalog = new NegotiationRepository(db).catalog(ids);
  const agents = new Map(privateCatalog.sellers.map(s => [s.seller_id, new SellerAgent(s, new ModelGateway())]));
  const registrations = ids.map(id => ({ seller_id: id, snapshot_id: snapshotId, handle: async (rfq, context) => {
    const decision = await agents.get(id).negotiate({ rfq, previous: [], now: Date.now(), offerTtlMs: 600000, audit: [], ...context });
    context.capture?.(decision.provider);
    return decision.result;
  } }));
  const service = createOrchestratorHandoff({ db, userId: buyerId, registrations, timeoutMs: 30000 });
  const args = { request_id: requestId, snapshot_id: snapshotId, idempotency_key: 'e2e-prepare' };
  const plan = service.prepare(args);
  // The full-round manager owns dispatch. Do not additionally call the upstream
  // first-round-only dispatcher, which would negotiate/pay for round one twice.
  const sellerFactory = (seller, gateway) => {
    const agent = agents.get(seller.seller_id); agent.gateway = gateway;
    const handler = registrations.find(r => r.seller_id === seller.seller_id).handle;
    return { negotiate: async ({ rfq, ...context }) => {
      let provider;
      const result = await handler(rfq, { ...context, capture: value => { provider = value; } });
      return { result, provider };
    } };
  };
  return { requestId, buyerId, orchestration: plan.orchestration, sellerFactory, plan, replayPlan: () => service.prepare(args) };
}
