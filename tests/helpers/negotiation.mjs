import { readFileSync } from 'node:fs';

const store = JSON.parse(readFileSync(new URL('../../contracts/fixtures/sellers.json', import.meta.url), 'utf8'));
const happy = JSON.parse(readFileSync(new URL('../../contracts/fixtures/happy-path.json', import.meta.url), 'utf8'));
export const NOW = Date.parse('2026-09-12T05:00:00Z');
export function fixture(sellerId = 'seller_a') {
  return structuredClone({ seller: store.sellers.find(s => s.seller_id === sellerId), terms: store.terms,
    intent: happy.request.normalized_intent, branch: happy.orchestration.seller_agents.find(s => s.seller_id === sellerId),
    rfq: happy.rfqs.find(q => q.seller_id === sellerId && q.round === 1), catalog: store });
}
export const unavailableModel = { decide: async () => { throw new Error('model_unconfigured'); } };
export const modelReturning = value => ({ decide: async () => structuredClone(value) });
export const invocation = () => ({ now: NOW, offerTtlMs: 600000, signal: new AbortController().signal, audit: [], previous: [] });
export function quote(product, overrides = {}) {
  return { draft_ref: 'mouse', variant: 'standalone', baseline_draft_ref: null,
    items: [{ product_id: product.product_id, category: 'mouse', role: 'primary', quantity: 1 }],
    primary_features: [...product.features], total_price_twd: product.list_price_twd - 30,
    delivery_days: product.delivery_days, terms_id: product.terms_id, optional_addons: false,
    expires_at: new Date(NOW + 600000).toISOString(), ...overrides };
}
export function proposal(seller, drafts) {
  return { request_id: 'req_demo_001', seller_id: seller.seller_id, round: 1,
    outcome: 'offered', is_final: false, drafts, message: 'Quote' };
}
