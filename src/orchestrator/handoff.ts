import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { NormalizedIntent, ProductPreference } from './data-tools.ts';
import { createOrchestratorDataTools } from './data-tools.ts';
import { createDiscoveryService } from './discovery.ts';
import type { DiscoveryQuery, Catalog, Listing } from './discovery.ts';
import { assertContract } from './contract.ts';
import { matchesPreference, validatePreferences } from './preferences.ts';

type WithoutSource<T> = T extends unknown ? Omit<T, 'source_text'> : never;
export type RFQPreference = WithoutSource<ProductPreference>;
export type SellerRFQ = {
  request_id: string; seller_id: string; round: number; category: 'mouse';
  required_features: string[]; candidate_product_ids: string[];
  product_preferences: RFQPreference[]; pending_checks: ('availability' | 'delivery')[];
  delivery_days_max: number; allowed_addon_categories: 'mouse_pad'[];
  target_total_twd: number | null; previous_offer_ids: string[];
};
export type SellerDraft = {
  draft_ref: string; variant: 'standalone' | 'bundle'; baseline_draft_ref: string | null;
  items: { product_id: string; category: 'mouse' | 'mouse_pad'; role: 'primary' | 'addon'; quantity: 1 }[];
  primary_features: string[]; total_price_twd: number; delivery_days: number;
  terms_id: string; optional_addons: boolean; expires_at: string;
};
export type SellerNegotiationResult = {
  request_id: string; seller_id: string; round: number;
  outcome: 'offered' | 'refused' | 'timeout' | 'error'; is_final: boolean;
  drafts: SellerDraft[]; message: string;
};
// Seller reads its own catalog/policy in its closure. The RFQ is the entire business input.
export type SellerHandler = (rfq: SellerRFQ, context: { signal: AbortSignal }) => Promise<SellerNegotiationResult>;
export type SellerRegistration = { seller_id: string; snapshot_id: string; handle: SellerHandler };
type PrepareArgs = { request_id: string; snapshot_id: string; idempotency_key: string; target_total_twd?: number };
type Discovery = ReturnType<ReturnType<typeof createDiscoveryService>['discover_candidates']>;

export function toDiscoveryQuery(intent: NormalizedIntent, target?: number): DiscoveryQuery {
  assertContract('NormalizedIntent', intent);
  validatePreferences(intent.product_preferences);
  return {
    category: intent.category, max_total_twd: intent.max_total_twd,
    delivery_days_max: intent.delivery_days_max, required_features: [...intent.required_features],
    product_preferences: structuredClone(intent.product_preferences),
    priorities: [...intent.preferences],
    ...(target === undefined ? {} : { target_total_twd: target }),
  };
}

export function buildSellerRFQ(requestId: string, intent: NormalizedIntent, candidate: Discovery['candidates'][number]): SellerRFQ {
  if (!candidate.negotiation_ready || candidate.candidate_status !== 'qualified') throw new Error('candidate_not_ready');
  const rfq: SellerRFQ = {
    request_id: requestId, seller_id: candidate.seller.seller_id, round: 1, category: intent.category,
    required_features: [...intent.required_features], candidate_product_ids: [candidate.listing.product_id],
    product_preferences: intent.product_preferences.map(p => {
      // Whitelist: never forward source_text, intent_md, private budget or trading priorities.
      const common = { preference_id: p.preference_id, strength: p.strength, attribute: p.attribute, operator: p.operator };
      return p.operator === 'range' ? { ...common, min: p.min, max: p.max } : { ...common, values: [...p.values] };
    }) as RFQPreference[],
    pending_checks: [], delivery_days_max: intent.delivery_days_max,
    allowed_addon_categories: intent.negotiation_policy.bundle_mode === 'disabled' ? [] : [...intent.negotiation_policy.allowed_addon_categories],
    // Discovery target is private ranking input, not authorization to disclose a bargaining target.
    target_total_twd: null, previous_offer_ids: [],
  };
  assertContract('SellerRFQ', rfq);
  return rfq;
}

function attributes(listing: Listing) {
  return Object.fromEntries(['size_class','color','shape','length_mm','width_mm','height_mm'].map(k => [k, listing.attributes[k] ?? null]));
}
function orchestration(discovery: Discovery, intent: NormalizedIntent, catalog: Catalog) {
  const selected = discovery.candidates.filter(c => c.negotiation_ready);
  const result = {
    seller_agents: selected.map((c, i) => ({
      seller_id: c.seller.seller_id, name: c.seller.name, listing_rank: i + 1,
      match_reason: c.selection_reasons.join('；'),
      candidate_products: [{ product_id: c.listing.product_id, attributes: attributes(c.listing),
        matched_preference_ids: intent.product_preferences.filter(p => matchesPreference(c.listing.attributes,p)).map(p=>p.preference_id),
        unmatched_preference_ids: intent.product_preferences.filter(p => !matchesPreference(c.listing.attributes,p)).map(p=>p.preference_id),
        pending_checks: [] }],
      trust: { personal_band:'neutral', personal_rating:null, personal_count:0,
        marketplace_rating:c.seller.rating, marketplace_count:c.seller.rating_count },
      status:'pending', rounds:[], stop_reason:null, final_offer_ids:[],
    })),
    discovery_exclusions: catalog.sellers.filter(s => !s.enabled).map(s => ({
      seller_id:s.seller_id, reason:'seller_unavailable', product_checks:[],
    })),
    sponsored_placement: selected.some(c => c.seller.seller_id === discovery.sponsored_placement?.seller_id) ? discovery.sponsored_placement : null,
  };
  assertContract('OrchestrationResult', result);
  return result;
}

export function createOrchestratorHandoff(options: {
  db: DatabaseSync; userId: string; registrations: SellerRegistration[];
  timeoutMs: number; now?: () => Date;
}) {
  const { db, userId, timeoutMs } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('invalid_timeout');
  const now = options.now ?? (() => new Date());
  const registry = new Map<string, SellerRegistration>();
  for (const entry of options.registrations) {
    if (registry.has(entry.seller_id) || typeof entry.handle !== 'function') throw new Error('invalid_registry');
    registry.set(entry.seller_id, { ...entry });
  }
  const tools = createOrchestratorDataTools({ db, userId, registeredSellerIds: [...registry.keys()] });
  function rowFor(id: string) {
    const row = db.prepare('SELECT * FROM orchestrator_handoffs WHERE handoff_id=? AND user_id=?').get(id,userId);
    if (!row) throw new Error('not_found: handoff');
    return row;
  }

  function prepare(args: PrepareArgs) {
    if (args.target_total_twd !== undefined && (!Number.isInteger(args.target_total_twd) || args.target_total_twd <= 0))
      throw new Error('invalid_target');
    if (typeof args.idempotency_key !== 'string' || args.idempotency_key.length < 1 || args.idempotency_key.length > 128)
      throw new Error('invalid_idempotency_key');
    const input = JSON.stringify({ snapshot_id:args.snapshot_id, target_total_twd:args.target_total_twd ?? null });
    db.exec('SAVEPOINT prepare_handoff');
    try {
      const request = tools.get_request_context({ request_id:args.request_id });
      const previous = db.prepare('SELECT * FROM orchestrator_handoffs WHERE user_id=? AND request_id=? AND idempotency_key=?')
        .get(userId,args.request_id,args.idempotency_key);
      if (previous) {
        if (previous.input_json !== input) throw new Error('idempotency_conflict');
        db.exec('RELEASE prepare_handoff');
        return JSON.parse(String(previous.plan_json)) as ReturnType<typeof makePlan>;
      }
      if (!request.normalized_intent) throw new Error('intent_not_ready');
      const query = toDiscoveryQuery(request.normalized_intent, args.target_total_twd);
      const catalogRow = db.prepare('SELECT content_json FROM discovery_catalogs WHERE snapshot_id=?').get(args.snapshot_id);
      if (!catalogRow) throw new Error('not_found: catalog');
      const catalog: Catalog = JSON.parse(String(catalogRow.content_json));
      const productKeys = new Set<string>();
      for (const listing of catalog.listings) {
        const key = JSON.stringify([listing.seller_id,listing.product_id]);
        if (productKeys.has(key)) throw new Error('ambiguous_catalog_product: listing mapping requires contract update');
        productKeys.add(key);
      }
      const registeredSellerIds = [...registry.values()].filter(r => r.snapshot_id === args.snapshot_id).map(r=>r.seller_id);
      const createdAt = now().toISOString();
      const discovery = createDiscoveryService({ db,userId,registeredSellerIds }).discover_candidates({ query,snapshot_id:args.snapshot_id,now:createdAt });
      const plan = makePlan(request, catalog, discovery);
      db.prepare('INSERT INTO orchestrator_handoffs VALUES (?,?,?,?,?,?,?,NULL,?)').run(
        plan.handoff_id,userId,args.request_id,args.idempotency_key,input,JSON.stringify(plan),'prepared',createdAt);
      db.exec('RELEASE prepare_handoff');
      return plan;
    } catch (e) { db.exec('ROLLBACK TO prepare_handoff'); db.exec('RELEASE prepare_handoff'); throw e; }
  }
  function makePlan(request: ReturnType<typeof tools.get_request_context>, catalog: Catalog, discovery: Discovery) {
    const intent = request.normalized_intent!;
    const selected = discovery.candidates.filter(c=>c.negotiation_ready);
    return { handoff_id:randomUUID(),request_id:request.request_id,revision:request.documents.revision,
      snapshot_id:catalog.snapshot_id,timeout_ms:timeoutMs,discovery,
      orchestration:orchestration(discovery,intent,catalog),
      rfqs:selected.map(c=>buildSellerRFQ(request.request_id,intent,c)),
      // Backend-only, never passed to Seller; snapshot needed by future offer validator.
      intent_snapshot:structuredClone(intent),
      product_bindings:selected.map(c=>({seller_id:c.seller.seller_id,listing_id:c.listing.listing_id,product_id:c.listing.product_id})),
      status:selected.length ? 'ready' : 'no_dispatchable_sellers',
    };
  }

  async function dispatchFirstRound(args: { handoff_id: string }) {
    const row = rowFor(args.handoff_id);
    if (row.status === 'dispatched') return JSON.parse(String(row.results_json)) as SellerNegotiationResult[];
    const claimed = db.prepare("UPDATE orchestrator_handoffs SET status='dispatching' WHERE handoff_id=? AND user_id=? AND status='prepared'")
      .run(args.handoff_id,userId);
    if (claimed.changes !== 1) throw new Error('handoff_in_progress: no automatic retry');
    const plan = JSON.parse(String(row.plan_json)) as ReturnType<typeof makePlan>;
    const results = await Promise.all(plan.rfqs.map(async rfq => {
      const failure = (outcome: 'error' | 'timeout', message: string): SellerNegotiationResult => ({
        request_id:rfq.request_id,seller_id:rfq.seller_id,round:1,outcome,is_final:false,drafts:[],message });
      const registration = registry.get(rfq.seller_id);
      if (!registration || registration.snapshot_id !== plan.snapshot_id) return failure('error','handler_unavailable');
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_,reject) => { timer = setTimeout(() => {
          timedOut = true;
          controller.abort(); reject(new Error('seller_timeout'));
        },plan.timeout_ms); });
        const result = await Promise.race([
          Promise.resolve().then(()=>registration.handle(structuredClone(rfq),{signal:controller.signal})),timeout,
        ]);
        assertContract('SellerNegotiationResult',result);
        if (result.request_id !== rfq.request_id || result.seller_id !== rfq.seller_id || result.round !== 1) throw new Error('mismatched_result');
        for (const draft of result.drafts) {
          const primary = draft.items.filter(i=>i.role==='primary');
          if (primary.length !== 1 || !rfq.candidate_product_ids.includes(primary[0].product_id)) throw new Error('wrong_primary');
        }
        // Shape/identity checked only. Drafts remain untrusted and have NO formal offer_id.
        return structuredClone(result);
      } catch (e) {
        return timedOut ? failure('timeout','seller_timeout') : failure('error','invalid_or_failed_seller_result');
      } finally { if (timer) clearTimeout(timer); }
    }));
    db.prepare("UPDATE orchestrator_handoffs SET status='dispatched', results_json=? WHERE handoff_id=? AND user_id=? AND status='dispatching'")
      .run(JSON.stringify(results),args.handoff_id,userId);
    return results;
  }
  return { prepare, dispatch_first_round:dispatchFirstRound };
}
