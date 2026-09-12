/* Generated from contracts/a2a-commerce.v0.3.schema.json. Run npm run generate:types; do not edit. */

export type NegotiationRound = number;
export type BranchStopReason =
  | null
  | 'seller_final'
  | 'refused'
  | 'timeout'
  | 'error'
  | 'no_adjustment'
  | 'max_rounds'
  | 'global_deadline'
  | 'call_budget'
  | 'token_budget';
export type Id = string;
export type Timestamp = string;
export type MoneyTwd = number;
export type ProductCategory = 'mouse' | 'mouse_pad';
export type Status =
  | 'formatting'
  | 'awaiting_user'
  | 'needs_clarification'
  | 'needs_confirmation'
  | 'no_match'
  | 'failed'
  | 'accepted'
  | 'rejected';
export type EligibilityReasonCode =
  | 'related_bundle'
  | 'no_extra_cost'
  | 'within_addon_cap'
  | 'addon_consent_required'
  | 'baseline_unavailable'
  | 'over_budget'
  | 'missing_feature'
  | 'quantity_changed'
  | 'delivery_too_late'
  | 'expired'
  | 'invalid_offer'
  | 'unrelated_addon'
  | 'bundle_disabled'
  | 'terms_changed'
  | 'addon_not_optional';
export type NegotiationPolicy =
  | {
      bundle_mode: 'disabled';
      allowed_addon_categories: unknown[];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: 'related_no_extra_cost';
      allowed_addon_categories: 'mouse_pad'[];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: 'related_with_cap';
      allowed_addon_categories: 'mouse_pad'[];
      max_addon_increment_twd: number;
    };
export type ProductPreference = CategoricalProductPreference | RangeProductPreference;
export type DecisionResult = AcceptDecisionResult | RejectDecisionResult;
export type RFQProductPreference =
  | {
      preference_id: Id;
      strength: 'required' | 'preferred';
      attribute: 'size_class' | 'color' | 'shape';
      operator: 'in' | 'not_in';
      values: string[];
    }
  | {
      preference_id: Id;
      strength: 'required' | 'preferred';
      attribute: 'length_mm' | 'width_mm' | 'height_mm';
      operator: 'range';
      min: number | null;
      max: number | null;
    };
export type EligibleOffer = unknown;

export interface CommerceTypes {
  NegotiationRound: NegotiationRound;
  BranchStopReason: BranchStopReason;
  Id: Id;
  Timestamp: Timestamp;
  MoneyTwd: MoneyTwd;
  ProductCategory: ProductCategory;
  Status: Status;
  EligibilityReasonCode: EligibilityReasonCode;
  DocumentBundle: DocumentBundle;
  CreateRequest: CreateRequest;
  AcceptDecision: AcceptDecision;
  RejectDecision: RejectDecision;
  RedeemRequest: RedeemRequest;
  NegotiationPolicy: NegotiationPolicy;
  CategoricalProductPreference: CategoricalProductPreference;
  RangeProductPreference: RangeProductPreference;
  ProductPreference: ProductPreference;
  NormalizedIntent: NormalizedIntent;
  ProductAttributes: ProductAttributes;
  ProductMatch: ProductMatch;
  Trust: Trust;
  SellerRound: SellerRound;
  SellerAgent: SellerAgent;
  SponsoredPlacement: SponsoredPlacement;
  DiscoveryProductCheck: DiscoveryProductCheck;
  DiscoveryExclusion: DiscoveryExclusion;
  OrchestrationResult: OrchestrationResult;
  OfferItem: OfferItem;
  Eligibility: Eligibility;
  Offer: Offer;
  RankedOffer: RankedOffer;
  ApiError: ApiError;
  RequestSnapshot: RequestSnapshot;
  AcceptDecisionResult: AcceptDecisionResult;
  RejectDecisionResult: RejectDecisionResult;
  DecisionResult: DecisionResult;
  RedemptionReceipt: RedemptionReceipt;
  ErrorResponse: ErrorResponse;
  RFQProductPreference: RFQProductPreference;
  SellerRFQ: SellerRFQ;
  SellerOfferDraft: SellerOfferDraft;
  SellerNegotiationResult: SellerNegotiationResult;
  SellerTrustEntry: SellerTrustEntry;
  EligibleOffer: EligibleOffer;
  EvaluatorInput: EvaluatorInput;
  EvaluatorOutput: EvaluatorOutput;
  MarketplacePrice: MarketplacePrice;
  MarketplaceEvidence: MarketplaceEvidence;
  MarketplaceSourceSnapshot: MarketplaceSourceSnapshot;
  CatalogProductFixture: CatalogProductFixture;
  SellerFixtureStore: SellerFixtureStore;
  DemoScenarioSuite: DemoScenarioSuite;
}
export interface DocumentBundle {
  revision: number;
  intent_md: string;
  preference_md: string;
}
export interface CreateRequest {
  intent_md: string;
  preference_md?: string;
}
export interface AcceptDecision {
  action: 'accept';
  offer_id: Id;
}
export interface RejectDecision {
  action: 'reject';
  feedback: string;
}
export interface RedeemRequest {
  request_id: Id;
  offer_id: Id;
}
export interface CategoricalProductPreference {
  preference_id: Id;
  strength: 'required' | 'preferred';
  source_text: string;
  attribute: 'size_class' | 'color' | 'shape';
  operator: 'in' | 'not_in';
  values: string[];
}
export interface RangeProductPreference {
  preference_id: Id;
  strength: 'required' | 'preferred';
  source_text: string;
  attribute: 'length_mm' | 'width_mm' | 'height_mm';
  operator: 'range';
  min: number | null;
  max: number | null;
}
export interface NormalizedIntent {
  category: 'mouse';
  max_total_twd: MoneyTwd;
  delivery_days_max: number;
  required_features: string[];
  preferences: ('price_first' | 'delivery_first' | 'trust_first')[];
  product_preferences: ProductPreference[];
  negotiation_policy: NegotiationPolicy;
}
export interface ProductAttributes {
  size_class: string | null;
  color: string | null;
  shape: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
}
export interface ProductMatch {
  product_id: Id;
  attributes: ProductAttributes;
  matched_preference_ids: Id[];
  unmatched_preference_ids: Id[];
  pending_checks: ('availability' | 'delivery')[];
}
export interface Trust {
  personal_band: 'positive' | 'neutral' | 'negative';
  personal_rating: number | null;
  personal_count: number;
  marketplace_rating: number | null;
  marketplace_count: number;
}
export interface SellerRound {
  round: NegotiationRound;
  outcome: 'offered' | 'refused' | 'timeout' | 'error';
  /**
   * Seller explicitly ends this branch; valid only with an offered outcome.
   */
  is_final: boolean;
  offer_ids: Id[];
}
/**
 * One Buyer branch for a selected Seller. Backend assigns stop_reason; null means active. IDs and round order require cross-object validation.
 */
export interface SellerAgent {
  seller_id: Id;
  name: string;
  listing_rank: number;
  match_reason: string;
  candidate_products: ProductMatch[];
  trust: Trust;
  status: 'pending' | 'negotiating' | 'offered' | 'refused' | 'timeout' | 'error';
  rounds: SellerRound[];
  stop_reason: BranchStopReason;
  final_offer_ids: Id[];
}
export interface SponsoredPlacement {
  seller_id: Id;
  campaign_id: Id;
  label: 'Sponsored';
}
export interface DiscoveryProductCheck {
  product_id: Id;
  reason:
    'required_mismatch' | 'required_attribute_unknown' | 'feature_mismatch' | 'out_of_stock' | 'delivery_too_late';
  preference_id: Id | null;
  missing_attribute: 'size_class' | 'color' | 'shape' | 'length_mm' | 'width_mm' | 'height_mm' | null;
}
export interface DiscoveryExclusion {
  seller_id: Id;
  reason: 'seller_unavailable' | 'no_matching_product' | 'insufficient_product_data';
  product_checks: DiscoveryProductCheck[];
}
export interface OrchestrationResult {
  seller_agents: SellerAgent[];
  discovery_exclusions: DiscoveryExclusion[];
  sponsored_placement: SponsoredPlacement | null;
}
export interface OfferItem {
  product_id: Id;
  category: ProductCategory;
  role: 'primary' | 'addon';
  quantity: 1;
}
export interface Eligibility {
  status: 'eligible' | 'needs_confirmation' | 'rejected';
  reason_codes: EligibilityReasonCode[];
}
export interface Offer {
  offer_id: Id;
  seller_id: Id;
  round: NegotiationRound;
  variant: 'standalone' | 'bundle';
  baseline_offer_id: Id | null;
  items: OfferItem[];
  primary_features: string[];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
  eligibility: Eligibility;
}
export interface RankedOffer {
  rank: number;
  offer_id: Id;
  reason: string;
  tradeoffs: string[];
}
export interface ApiError {
  code: string;
  message: string;
  fields: string[];
}
export interface RequestSnapshot {
  request_id: Id;
  root_request_id: Id;
  parent_request_id: null;
  status: Status;
  documents: DocumentBundle;
  intent: NormalizedIntent | null;
  seller_agents: SellerAgent[];
  discovery_exclusions: DiscoveryExclusion[];
  sponsored_placement: SponsoredPlacement | null;
  offers: Offer[];
  ranked_offers: RankedOffer[];
  confirmation_offer_ids: Id[];
  selected_offer_id: Id | null;
  next_request_id: null;
  error: ApiError | null;
  decision: DecisionResult | null;
}
export interface AcceptDecisionResult {
  action: 'accept';
  request_id: Id;
  status: 'accepted';
  selected_offer_id: Id;
  expires_at: Timestamp;
}
export interface RejectDecisionResult {
  action: 'reject';
  request_id: Id;
  status: 'rejected';
  feedback: string;
  source_documents: DocumentBundle;
}
export interface RedemptionReceipt {
  redemption_id: Id;
  request_id: Id;
  offer_id: Id;
  seller_id: Id;
  status: 'redeemed';
  mode: 'virtual_market';
  total_price_twd: MoneyTwd;
  redeemed_at: Timestamp;
}
export interface ErrorResponse {
  error: ApiError;
}
export interface SellerRFQ {
  request_id: Id;
  seller_id: Id;
  round: NegotiationRound;
  category: 'mouse';
  required_features: string[];
  candidate_product_ids: Id[];
  product_preferences: RFQProductPreference[];
  pending_checks: ('availability' | 'delivery')[];
  delivery_days_max: number;
  allowed_addon_categories: 'mouse_pad'[];
  target_total_twd: number | null;
  previous_offer_ids: Id[];
}
/**
 * Untrusted Seller proposal. The Backend assigns offer_id and eligibility after validation.
 */
export interface SellerOfferDraft {
  draft_ref: Id;
  variant: 'standalone' | 'bundle';
  baseline_draft_ref: Id | null;
  items: OfferItem[];
  primary_features: string[];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
}
export interface SellerNegotiationResult {
  request_id: Id;
  seller_id: Id;
  round: NegotiationRound;
  outcome: 'offered' | 'refused' | 'timeout' | 'error';
  /**
   * Seller explicitly ends this branch; valid only with an offered outcome.
   */
  is_final: boolean;
  drafts: SellerOfferDraft[];
  message: string;
}
export interface SellerTrustEntry {
  seller_id: Id;
  trust: Trust;
}
/**
 * Campaign and Sponsored data are intentionally absent.
 */
export interface EvaluatorInput {
  request_id: Id;
  evaluated_at: Timestamp;
  intent: NormalizedIntent;
  offers: EligibleOffer[];
  seller_trust: SellerTrustEntry[];
}
export interface EvaluatorOutput {
  ranked_offers: RankedOffer[];
}
export interface MarketplacePrice {
  amount: number;
  currency: 'TWD' | 'EUR' | 'USD';
  includes_tax: 'yes' | 'no' | 'unknown';
  includes_shipping: 'yes' | 'no' | 'unknown';
}
export interface MarketplaceEvidence {
  source_id: Id;
  marketplace: 'shopee_tw' | 'amazon_ie' | 'logitech_official';
  source_type: 'marketplace_listing' | 'marketplace_search_result' | 'manufacturer_spec';
  product_key: Id;
  title: string;
  url: string;
  retrieved_at: Timestamp;
  observed_at: Timestamp | null;
  freshness: 'current' | 'current_cached' | 'stale_cached_reference';
  availability: 'listed' | 'in_stock' | 'sold_out' | 'unknown' | 'not_applicable';
  price: MarketplacePrice | null;
  facts: string[];
  notes: string[];
}
export interface MarketplaceSourceSnapshot {
  fixture_version: '0.2';
  snapshot_id: Id;
  retrieved_at: Timestamp;
  purpose: string;
  usage_policy: {
    live_checkout_allowed: false;
    price_guarantee: false;
    taiwan_demo_price_sources: 'shopee_tw'[];
    reference_only_sources: ('amazon_ie' | 'logitech_official')[];
    notes: string[];
  };
  sources: MarketplaceEvidence[];
}
export interface CatalogProductFixture {
  product_id: Id;
  category: ProductCategory;
  brand: string;
  model: string;
  name: string;
  features: string[];
  attributes: ProductAttributes;
  source_price_twd: MoneyTwd;
  list_price_twd: MoneyTwd;
  floor_price_twd: MoneyTwd;
  stock: number;
  delivery_days: number;
  terms_id: Id;
  source_ids: Id[];
}
export interface SellerFixtureStore {
  fixture_version: '0.3';
  generated_at: Timestamp;
  source_snapshot_id: Id;
  data_classification: {
    public_snapshot_fields: string[];
    synthetic_demo_fields: string[];
    notice: string;
  };
  terms: {
    terms_id: Id;
    warranty_months: number;
    return_days: number;
    payment_obligation: 'one_time';
  }[];
  sellers: {
    seller_id: Id;
    name: string;
    enabled: boolean;
    strategy: {
      type:
        'lowest_price_slow_delivery' | 'premium_fast_delivery' | 'value_bundle' | 'balanced_delivery' | 'firm_price';
      round_discounts_twd: number[];
      final_round: NegotiationRound | null;
      bundle_mode: 'none' | 'free_optional_mouse_pad';
    };
    trust: Trust;
    products: CatalogProductFixture[];
  }[];
  campaigns: {
    campaign_id: Id;
    seller_id: Id;
    enabled: boolean;
    target_category: ProductCategory;
    bid_twd: MoneyTwd;
    starts_at: Timestamp;
    ends_at: Timestamp;
  }[];
}
export interface DemoScenarioSuite {
  fixture_version: '0.3';
  catalog_fixture: 'sellers.json';
  source_snapshot: 'marketplace-source-snapshot.json';
  canonical_flow_fixture: 'happy-path.json';
  scenarios: {
    scenario_id: Id;
    title: string;
    intent: {
      max_total_twd: MoneyTwd;
      delivery_days_max: number;
      required_features: string[];
      preferences: ('price_first' | 'delivery_first' | 'trust_first')[];
      required_color: string;
      preferred_shape: string | null;
      bundle_mode: 'disabled' | 'related_no_extra_cost' | 'related_with_cap';
    };
    runtime_faults: string[];
    expected: {
      request_status: Status;
      seller_statuses: {
        seller_a: 'offered' | 'refused' | 'timeout' | 'error' | 'no_match';
        seller_b: 'offered' | 'refused' | 'timeout' | 'error' | 'no_match';
        seller_c: 'offered' | 'refused' | 'timeout' | 'error' | 'no_match';
        seller_d: 'offered' | 'refused' | 'timeout' | 'error' | 'no_match';
        seller_e: 'offered' | 'refused' | 'timeout' | 'error' | 'no_match';
      };
      eligible_offer_ids: Id[];
      recommended_offer_id: Id | null;
      reason_codes: EligibilityReasonCode[];
    };
  }[];
}
