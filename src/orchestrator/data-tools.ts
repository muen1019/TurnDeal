import { DatabaseSync } from 'node:sqlite';
import { publicServices } from './public-services.mjs';
import type { PublicService } from './discovery.ts';

export type Category = 'mouse' | 'mouse_pad';
export type Attributes = {
  size_class: string | null; color: string | null; shape: string | null;
  length_mm: number | null; width_mm: number | null; height_mm: number | null;
};
export type ProductPreference = {
  preference_id: string; strength: 'required' | 'preferred'; source_text: string;
} & ({ attribute: 'size_class' | 'color' | 'shape'; operator: 'in' | 'not_in'; values: string[] }
  | { attribute: 'length_mm' | 'width_mm' | 'height_mm'; operator: 'range'; min: number | null; max: number | null });
export type NormalizedIntent = {
  category: 'mouse'; max_total_twd: number; delivery_days_max: number;
  required_features: string[]; preferences: ('price_first' | 'delivery_first' | 'trust_first' | 'after_sales_first')[];
  product_preferences: ProductPreference[];
  negotiation_policy: {
    bundle_mode: 'disabled' | 'related_no_extra_cost' | 'related_with_cap';
    allowed_addon_categories: 'mouse_pad'[]; max_addon_increment_twd: number;
  };
};
export type RequestContext = {
  request_id: string; status: string;
  documents: { revision: number; intent_md: string; preference_md: string };
  normalized_intent: NormalizedIntent | null;
};
export type CatalogItem = {
  product_id: string; seller_id: string; category: Category; brand: string; model: string; name: string;
  features: string[]; attributes: Attributes; source_price_twd: number; list_price_twd: number;
  stock: number; delivery_days: number; terms_id: string; source_ids: string[];
  public_services: PublicService[];
};
export type Seller = {
  seller_id: string; name: string; enabled: boolean; handler_registered: boolean;
  persona: 'price_optimizer' | 'speed_seller' | 'bundle_curator' | 'loyalty_builder' | 'margin_guardian' | null;
};
export type Trust = {
  personal_band: 'positive' | 'neutral' | 'negative'; personal_rating: number | null;
  personal_count: number; marketplace_rating: number | null; marketplace_count: number;
};
export type Campaign = {
  campaign_id: string; seller_id: string; target_category: Category;
  bid_twd: number; starts_at: string; ends_at: string;
};
export type DiscoveryInput = {
  request: RequestContext; catalog: CatalogItem[]; sellers: Seller[];
  seller_trust: { seller_id: string; trust: Trust }[];
  campaigns: Campaign[]; now: string;
};

export class DataToolError extends Error {
  code: 'invalid_argument' | 'not_found' | 'intent_not_ready';
  constructor(code: DataToolError['code'], message: string) {
    super(message); this.name = 'DataToolError'; this.code = code;
  }
}

function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new DataToolError('invalid_argument', 'Invalid identifier');
  }
}
function category(value: unknown): asserts value is Category {
  if (value !== 'mouse' && value !== 'mouse_pad') throw new DataToolError('invalid_argument', 'Unsupported category');
}
function timestamp(value: string): string {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new DataToolError('invalid_argument', 'now must be a timestamp with timezone');
  }
  return new Date(value).toISOString();
}
function decode<T>(value: unknown): T { return JSON.parse(String(value)) as T; }

/** Bind user identity and handler registry in trusted Backend code, never in model arguments.
 * This factory does not own or close the database connection. Methods only read data.
 */
export function createOrchestratorDataTools(options: {
  db: DatabaseSync; userId: string; registeredSellerIds: readonly string[];
  demoTrustUserId?: string;
}) {
  const { db, userId } = options;
  id(userId);
  const handlers = new Set(options.registeredSellerIds);
  for (const sellerId of handlers) id(sellerId);
  const demoTrustUserId = options.demoTrustUserId ?? null;

  function get_request_context(args: { request_id: string }): RequestContext {
    id(args.request_id);
    const row = db.prepare(`SELECT request_id, status, revision, intent_md, preference_md,
      normalized_intent_json FROM requests WHERE request_id = ? AND user_id = ?`).get(args.request_id, userId);
    if (!row) throw new DataToolError('not_found', 'Request not found');
    return {
      request_id: String(row.request_id), status: String(row.status),
      documents: { revision: Number(row.revision), intent_md: String(row.intent_md), preference_md: String(row.preference_md) },
      normalized_intent: decode<NormalizedIntent | null>(row.normalized_intent_json),
    };
  }

  function get_request_preferences(args: { request_id: string }) {
    const request = get_request_context(args);
    return {
      request_id: request.request_id, revision: request.documents.revision,
      preference_md: request.documents.preference_md,
      product_preferences: request.normalized_intent?.product_preferences ?? [],
      preferences: request.normalized_intent?.preferences ?? [],
      negotiation_policy: request.normalized_intent?.negotiation_policy ?? null,
    };
  }

  // Deliberately returns unavailable and non-matching SKUs too: discovery owns filtering/explanations.
  function list_catalog(args: { category: Category; seller_id?: string }): CatalogItem[] {
    category(args.category);
    if (args.seller_id !== undefined) id(args.seller_id);
    const rows = db.prepare(`SELECT p.*, i.seller_id, i.list_price_twd, i.stock, i.delivery_days, i.terms_id
      FROM products p JOIN seller_inventory i ON p.product_id = i.product_id
      WHERE p.category = ? AND (? IS NULL OR i.seller_id = ?) ORDER BY i.seller_id, p.product_id`)
      .all(args.category, args.seller_id ?? null, args.seller_id ?? null);
    const sourceQuery = db.prepare('SELECT source_id FROM product_sources WHERE product_id = ? ORDER BY source_id');
    return rows.map(row => ({
      product_id: String(row.product_id), seller_id: String(row.seller_id), category: row.category as Category,
      brand: String(row.brand), model: String(row.model), name: String(row.name),
      features: decode<string[]>(row.features_json), attributes: decode<Attributes>(row.attributes_json),
      source_price_twd: Number(row.source_price_twd), list_price_twd: Number(row.list_price_twd),
      stock: Number(row.stock), delivery_days: Number(row.delivery_days), terms_id: String(row.terms_id),
      source_ids: sourceQuery.all(row.product_id).map(source => String(source.source_id)),
      public_services: publicServices(db,String(row.seller_id),String(row.product_id)),
    }));
  }

  function list_sellers(): Seller[] {
    return db.prepare(`SELECT s.seller_id, s.name, s.enabled, json_extract(p.policy_json,'$.persona') AS persona
      FROM sellers s LEFT JOIN seller_persona_policies p ON p.seller_id=s.seller_id ORDER BY s.seller_id`).all().map(row => ({
      seller_id: String(row.seller_id), name: String(row.name), enabled: row.enabled === 1,
      persona: (row.persona ?? null) as Seller['persona'],
      handler_registered: handlers.has(String(row.seller_id)),
    }));
  }

  function get_seller_trust(args: { seller_id: string }): { seller_id: string; trust: Trust } {
    id(args.seller_id);
    const row = db.prepare(`SELECT seller_id, personal_band, personal_rating, personal_count,
      marketplace_rating, marketplace_count FROM sellers WHERE seller_id = ?`).get(args.seller_id);
    if (!row) throw new DataToolError('not_found', 'Seller not found');
    // Current DB has global synthetic personal ratings, not per-user transaction history.
    // Expose them only for the explicitly configured fixture buyer.
    const usePersonal = userId === demoTrustUserId;
    return { seller_id: String(row.seller_id), trust: {
      personal_band: usePersonal ? row.personal_band as Trust['personal_band'] : 'neutral',
      personal_rating: usePersonal ? row.personal_rating as number | null : null,
      personal_count: usePersonal ? Number(row.personal_count) : 0,
      marketplace_rating: row.marketplace_rating as number | null, marketplace_count: Number(row.marketplace_count),
    } };
  }

  function list_active_campaigns(args: { category: Category; now: string }): Campaign[] {
    category(args.category);
    const now = Date.parse(timestamp(args.now));
    return db.prepare(`SELECT campaign_id, seller_id, target_category, bid_twd, starts_at, ends_at
      FROM campaigns WHERE enabled = 1 AND target_category = ? AND bid_twd > 0 ORDER BY campaign_id`)
      .all(args.category)
      .filter(row => Date.parse(String(row.starts_at)) <= now && now < Date.parse(String(row.ends_at)))
      .map(row => ({ campaign_id: String(row.campaign_id), seller_id: String(row.seller_id),
        target_category: row.target_category as Category, bid_twd: Number(row.bid_twd),
        starts_at: String(row.starts_at), ends_at: String(row.ends_at) }));
  }

  function load_discovery_input(args: { request_id: string; now: string }): DiscoveryInput {
    const now = timestamp(args.now);
    // One consistent SQLite read snapshot for request/catalog/trust/campaigns.
    db.exec('SAVEPOINT discovery_read');
    try {
      const request = get_request_context(args);
      if (!request.normalized_intent) throw new DataToolError('intent_not_ready', 'Formatter has not completed');
      const sellers = list_sellers();
      const result = {
        request, catalog: list_catalog({ category: request.normalized_intent.category }), sellers,
        seller_trust: sellers.map(seller => get_seller_trust(seller)),
        campaigns: list_active_campaigns({ category: request.normalized_intent.category, now }), now,
      };
      db.exec('RELEASE discovery_read');
      return result;
    } catch (error) {
      db.exec('ROLLBACK TO discovery_read'); db.exec('RELEASE discovery_read'); throw error;
    }
  }

  return { get_request_context, get_request_preferences, list_catalog, list_sellers,
    get_seller_trust, list_active_campaigns, load_discovery_input };
}

export type OrchestratorDataTools = ReturnType<typeof createOrchestratorDataTools>;
