import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ProductPreference } from './data-tools.ts';
import { matchesPreference, validatePreferences } from './preferences.ts';
import {assertContract} from './contract.ts';
import type {RankingWeights} from './weighted.ts';

export type DiscoveryQuery = {
  ranking_weights?: RankingWeights;
  category: 'mouse'; target_total_twd?: number; max_total_twd?: number;
  required_features?: string[]; required_attributes?: Record<string, string>;
  preferred_attributes?: Record<string, string>; delivery_days_max?: number;
  product_preferences?: ProductPreference[];
  priorities?: ('price_first' | 'delivery_first' | 'trust_first')[];
};
export type Listing = {
  listing_id: string; product_id: string; seller_id: string; name: string; category: string;
  features: string[]; attributes: Record<string, string | number | null>; item_price_twd: number;
  shipping_twd: number | null; price_includes_tax: boolean;
  rating: number | null; rating_count: number; stock: number; delivery_days: number;
  source_ids: string[]; data_origin: string; synthetic_fields: string[];
};
export type Catalog = {
  snapshot_id: string; source_snapshot_id: string;
  sellers: { seller_id: string; name: string; platform: string; rating: number | null;
    rating_count: number; enabled: boolean; data_origin: string }[];
  listings: Listing[];
  campaigns: { campaign_id: string; seller_id: string; category: string; bid_twd: number;
    enabled: boolean; starts_at: string; ends_at: string }[];
};
export const POLICY_VERSION = 'discovery-score-v0.4';
const clamp = (v: number) => Math.max(0, Math.min(100, v));
// Fixed prior rather than a changing catalog average keeps scores stable across unrelated additions.
export const ratingScore = (rating: number | null, count: number) =>
  (((rating ?? 4) * (rating === null ? 0 : count) + 4 * 20) / ((rating === null ? 0 : count) + 20)) * 20;

function validate(q: DiscoveryQuery, now: string) {
  if(q?.ranking_weights)assertContract('RankingWeights',q.ranking_weights);
  if (!q || q.category !== 'mouse')
    throw new Error('invalid_argument: category=mouse required');
  if (q.product_preferences !== undefined) validatePreferences(q.product_preferences);
  if (q.priorities !== undefined && (!Array.isArray(q.priorities) || q.priorities.some(p => !['price_first','delivery_first','trust_first'].includes(p)) || new Set(q.priorities).size !== q.priorities.length))
    throw new Error('invalid_argument: priorities');
  for (const key of ['target_total_twd', 'max_total_twd', 'delivery_days_max'] as const)
    if (q[key] !== undefined && (!Number.isInteger(q[key]) || q[key]! <= 0)) throw new Error(`invalid_argument: ${key}`);
  if (!Array.isArray(q.required_features ?? []) || !(q.required_features ?? []).every(x => typeof x === 'string'))
    throw new Error('invalid_argument: required_features');
  for (const field of ['required_attributes', 'preferred_attributes'] as const) {
    const attrs = q[field];
    if (attrs !== undefined && (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs) ||
      Object.entries(attrs).some(([k,v]) => !['color','shape','size_class'].includes(k) || typeof v !== 'string' || !v)))
      throw new Error(`invalid_argument: ${field}`);
  }
  if (typeof now !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(Date.parse(now)))
    throw new Error('invalid_argument: timezone timestamp required');
}

/** Pure deterministic ranking; no LLM and no database mutation. */
export function rankCandidates(catalog: Catalog, query: DiscoveryQuery, now: string,
  registeredSellerIds: readonly string[] = []) {
  validate(query, now);
  const preferred = Object.entries(query.preferred_attributes ?? {});
  const productPreferences = query.product_preferences ?? [];
  const soft = productPreferences.filter(p => p.strength === 'preferred');
  const preferenceCount = preferred.length + soft.length;
  const custom=query.ranking_weights&&!query.priorities?.length?query.ranking_weights:null;
  const colors=soft.filter(p=>p.attribute==='color');
  const base = custom?{price:custom.price,delivery:custom.delivery,seller_rating:custom.trust,product_rating:0,preference:colors.length?custom.color:0}:{ price: query.target_total_twd === undefined ? 0 : .45,
    preference: preferenceCount ? .25 : 0, product_rating: .15, seller_rating: .10, delivery: .05 };
  // Named trade priorities double their active weight before normalization.
  if (query.priorities?.includes('price_first')) base.price *= 2;
  if (query.priorities?.includes('delivery_first')) base.delivery *= 2;
  if (query.priorities?.includes('trust_first')) base.seller_rating *= 2;
  const activeWeight = Object.values(base).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, activeWeight?value / activeWeight:0])) as typeof base;
  const excluded: { listing_id: string; reasons: string[] }[] = [];
  const scored = catalog.listings.flatMap(listing => {
    const seller = catalog.sellers.find(s => s.seller_id === listing.seller_id);
    const reasons: string[] = [];
    if (!seller?.enabled) reasons.push('seller_unavailable');
    if (listing.category !== query.category) reasons.push('category_mismatch');
    if (listing.stock <= 0) reasons.push('out_of_stock');
    if (reasons.length || !seller) { excluded.push({ listing_id: listing.listing_id, reasons }); return []; }
    const total = listing.shipping_twd === null || !listing.price_includes_tax ? null : listing.item_price_twd + listing.shipping_twd;
    const violations: string[] = [];
    for (const p of productPreferences.filter(p => p.strength === 'required'))
      if (!matchesPreference(listing.attributes, p)) violations.push(`preference_mismatch:${p.preference_id}`);
    for (const f of query.required_features ?? []) if (!listing.features.includes(f)) violations.push(`missing_feature:${f}`);
    for (const [k,v] of Object.entries(query.required_attributes ?? {}))
      if (listing.attributes[k] !== v) violations.push(`attribute_mismatch:${k}`);
    if (query.delivery_days_max !== undefined && listing.delivery_days > query.delivery_days_max) violations.push('delivery_too_late');
    if (query.max_total_twd !== undefined && (total === null || total > query.max_total_twd)) violations.push('budget_unconfirmed');
    const matchCount = preferred.filter(([k,v]) => listing.attributes[k] === v).length + soft.filter(p => matchesPreference(listing.attributes, p)).length;
    const scores = {
      price: total === null || query.target_total_twd === undefined ? 0 : clamp(100 * (1 - Math.abs(total - query.target_total_twd) / query.target_total_twd)),
      preference: preferenceCount ? 100 * matchCount / preferenceCount : 0,
      product_rating: ratingScore(listing.rating, listing.rating_count),
      seller_rating: ratingScore(seller.rating, seller.rating_count),
      delivery: clamp(100 * (8 - listing.delivery_days) / 7),
    };
    if(custom){
      if(query.target_total_twd===undefined)scores.price=total===null||!query.max_total_twd?0:clamp(100*(1-total/query.max_total_twd));
      scores.delivery=clamp(100*(1-(listing.delivery_days-1)/(query.delivery_days_max??7)));
      scores.seller_rating=(seller.rating??3)/5*100;
      scores.preference=colors.length&&colors.every(p=>matchesPreference(listing.attributes,p))?100:0;
    }
    const score = Object.entries(weights).reduce((sum,[k,w]) => sum + scores[k as keyof typeof scores] * w, 0);
    return [{ listing, seller, total_price_twd: total, scores, score, violations,
      candidate_status: violations.length ? 'alternative_requires_confirmation' as const : 'qualified' as const,
      negotiation_ready: !violations.length && total !== null && registeredSellerIds.includes(seller.seller_id),
      pending_checks: total === null ? ['total_price_unknown'] : [],
      price_difference_twd: total === null || query.target_total_twd === undefined ? null : total - query.target_total_twd,
      selection_reasons: [`偏好命中 ${matchCount}/${preferenceCount}`, total === null ? '含稅運總價待確認' : `含稅運 ${total} 元`,
        custom?'套用已儲存偏好權重':query.target_total_twd === undefined ? '未設定目標價格，價格不參與評分' : `目標 ${query.target_total_twd} 元`],
    }];
  });
  // Hard-constraint compliant candidates always precede explicitly labelled alternatives.
  scored.sort((a,b) => Number(a.violations.length > 0) - Number(b.violations.length > 0) ||
    b.score - a.score || (a.listing.listing_id < b.listing.listing_id ? -1 : a.listing.listing_id > b.listing.listing_id ? 1 : 0));
  const seen = new Set<string>();
  const candidates = scored.filter(c => { if (seen.has(c.seller.seller_id)) return false; seen.add(c.seller.seller_id); return true; })
    .slice(0,5).map((c,i) => ({ ...c, rank: i+1, score: Math.round(c.score * 10000) / 10000 }));
  const campaigns = catalog.campaigns.filter(c => c.enabled && c.category === query.category && c.bid_twd > 0 &&
    Date.parse(c.starts_at) <= Date.parse(now) && Date.parse(now) < Date.parse(c.ends_at) &&
    candidates.some(x => x.seller.seller_id === c.seller_id && x.candidate_status === 'qualified'))
    .sort((a,b) => b.bid_twd-a.bid_twd || (a.campaign_id < b.campaign_id ? -1 : 1));
  return { policy_version: POLICY_VERSION, snapshot_id: catalog.snapshot_id, now, query,
    requested_count: 5, returned_count: candidates.length, weights, candidates, exclusions: excluded,
    sponsored_placement: campaigns.length ? { seller_id: campaigns[0].seller_id, campaign_id: campaigns[0].campaign_id, label: 'Sponsored' } : null,
    shortage_reason: candidates.length < 5 ? 'fewer_than_five_distinct_available_sellers' : null };
}

export function createDiscoveryService(options: { db: DatabaseSync; userId: string; registeredSellerIds: readonly string[] }) {
  return {
    discover_candidates(args: { query: DiscoveryQuery; snapshot_id: string; now: string }) {
      if (!options.db.prepare('SELECT user_id FROM users WHERE user_id=?').get(options.userId)) throw new Error('not_found: user');
      const row = options.db.prepare('SELECT content_json FROM discovery_catalogs WHERE snapshot_id=?').get(args.snapshot_id);
      if (!row) throw new Error('not_found: catalog');
      const result = rankCandidates(JSON.parse(String(row.content_json)), args.query, args.now, options.registeredSellerIds);
      const run_id = randomUUID();
      options.db.prepare('INSERT INTO discovery_runs VALUES (?, ?, ?, ?, ?, ?, ?)').run(run_id, options.userId,
        args.snapshot_id, POLICY_VERSION, JSON.stringify(args.query), JSON.stringify(result), new Date().toISOString());
      return { run_id, ...result };
    },
  };
}
