/* Generated from contracts/result-api.v0.2.schema.json. Do not edit by hand. */

/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "MoneyTwd".
 */
export type MoneyTwd = number;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ProductCategory".
 */
export type ProductCategory = "mouse" | "mouse_pad";
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Status".
 */
export type Status =
  | "formatting"
  | "awaiting_user"
  | "needs_clarification"
  | "needs_confirmation"
  | "no_match"
  | "failed"
  | "accepted"
  | "rejected";
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "EligibilityReasonCode".
 */
export type EligibilityReasonCode =
  | "related_bundle"
  | "no_extra_cost"
  | "within_addon_cap"
  | "addon_consent_required"
  | "baseline_unavailable"
  | "over_budget"
  | "missing_feature"
  | "quantity_changed"
  | "delivery_too_late"
  | "expired"
  | "invalid_offer"
  | "unrelated_addon"
  | "bundle_disabled"
  | "terms_changed"
  | "addon_not_optional";
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationPolicy".
 */
export type NegotiationPolicy =
  | {
      bundle_mode: "disabled";
      /**
       * @maxItems 0
       */
      allowed_addon_categories: [];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: "related_no_extra_cost";
      /**
       * @maxItems 1
       */
      allowed_addon_categories: [] | ["mouse_pad"];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: "related_with_cap";
      /**
       * @minItems 1
       * @maxItems 1
       */
      allowed_addon_categories: ["mouse_pad"];
      max_addon_increment_twd: number;
    };
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ProductPreference".
 */
export type ProductPreference = CategoricalProductPreference | RangeProductPreference;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DecisionResult".
 */
export type DecisionResult = AcceptDecisionResult | RejectDecisionResult;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RFQProductPreference".
 */
export type RFQProductPreference =
  | {
      preference_id: Id;
      strength: "required" | "preferred";
      attribute: "size_class" | "color" | "shape";
      operator: "in" | "not_in";
      /**
       * @minItems 1
       */
      values: [string, ...string[]];
    }
  | {
      preference_id: Id;
      strength: "required" | "preferred";
      attribute: "length_mm" | "width_mm" | "height_mm";
      operator: "range";
      min: number | null;
      max: number | null;
    };
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "EligibleOffer".
 */
export type EligibleOffer = unknown;

export interface A2ACommerceContracts {
  Id?: Id;
  Timestamp?: Timestamp;
  MoneyTwd?: MoneyTwd;
  ProductCategory?: ProductCategory;
  Status?: Status;
  EligibilityReasonCode?: EligibilityReasonCode;
  DocumentBundle?: DocumentBundle;
  CreateRequest?: CreateRequest;
  AcceptDecision?: AcceptDecision;
  RejectDecision?: RejectDecision;
  RedeemRequest?: RedeemRequest;
  NegotiationPolicy?: NegotiationPolicy;
  CategoricalProductPreference?: CategoricalProductPreference;
  RangeProductPreference?: RangeProductPreference;
  ProductPreference?: ProductPreference;
  NormalizedIntent?: NormalizedIntent;
  ProductAttributes?: ProductAttributes;
  ProductMatch?: ProductMatch;
  Trust?: Trust;
  SellerRound?: SellerRound;
  SellerAgent?: SellerAgent;
  SponsoredPlacement?: SponsoredPlacement;
  DiscoveryProductCheck?: DiscoveryProductCheck;
  DiscoveryExclusion?: DiscoveryExclusion;
  OrchestrationResult?: OrchestrationResult;
  OfferItem?: OfferItem;
  Eligibility?: Eligibility;
  Offer?: Offer;
  RankedOffer?: RankedOffer;
  ApiError?: ApiError;
  RequestSnapshot?: RequestSnapshot;
  AcceptDecisionResult?: AcceptDecisionResult;
  RejectDecisionResult?: RejectDecisionResult;
  DecisionResult?: DecisionResult;
  RedemptionReceipt?: RedemptionReceipt;
  ErrorResponse?: ErrorResponse;
  RFQProductPreference?: RFQProductPreference;
  SellerRFQ?: SellerRFQ;
  SellerOfferDraft?: SellerOfferDraft;
  SellerNegotiationResult?: SellerNegotiationResult;
  SellerTrustEntry?: SellerTrustEntry;
  EligibleOffer?: EligibleOffer;
  EvaluatorInput?: EvaluatorInput;
  EvaluatorOutput?: EvaluatorOutput;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DocumentBundle".
 */
export interface DocumentBundle {
  revision: number;
  intent_md: string;
  preference_md: string;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "CreateRequest".
 */
export interface CreateRequest {
  intent_md: string;
  preference_md?: string;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "AcceptDecision".
 */
export interface AcceptDecision {
  action: "accept";
  offer_id: Id;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RejectDecision".
 */
export interface RejectDecision {
  action: "reject";
  feedback: string;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RedeemRequest".
 */
export interface RedeemRequest {
  request_id: Id;
  offer_id: Id;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "CategoricalProductPreference".
 */
export interface CategoricalProductPreference {
  preference_id: Id;
  strength: "required" | "preferred";
  source_text: string;
  attribute: "size_class" | "color" | "shape";
  operator: "in" | "not_in";
  /**
   * @minItems 1
   */
  values: [string, ...string[]];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RangeProductPreference".
 */
export interface RangeProductPreference {
  preference_id: Id;
  strength: "required" | "preferred";
  source_text: string;
  attribute: "length_mm" | "width_mm" | "height_mm";
  operator: "range";
  min: number | null;
  max: number | null;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NormalizedIntent".
 */
export interface NormalizedIntent {
  category: "mouse";
  max_total_twd: MoneyTwd;
  delivery_days_max: number;
  /**
   * @minItems 1
   */
  required_features: [string, ...string[]];
  preferences: ("price_first" | "delivery_first" | "trust_first")[];
  product_preferences: ProductPreference[];
  negotiation_policy: NegotiationPolicy;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ProductAttributes".
 */
export interface ProductAttributes {
  size_class: string | null;
  color: string | null;
  shape: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ProductMatch".
 */
export interface ProductMatch {
  product_id: Id;
  attributes: ProductAttributes;
  matched_preference_ids: Id[];
  unmatched_preference_ids: Id[];
  pending_checks: ("availability" | "delivery")[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Trust".
 */
export interface Trust {
  personal_band: "positive" | "neutral" | "negative";
  personal_rating: number | null;
  personal_count: number;
  marketplace_rating: number | null;
  marketplace_count: number;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerRound".
 */
export interface SellerRound {
  round: 1 | 2;
  outcome: "offered" | "refused" | "timeout" | "error";
  /**
   * @maxItems 2
   */
  offer_ids: [] | [Id] | [Id, Id];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerAgent".
 */
export interface SellerAgent {
  seller_id: Id;
  name: string;
  listing_rank: number;
  match_reason: string;
  /**
   * @minItems 1
   */
  candidate_products: [ProductMatch, ...ProductMatch[]];
  trust: Trust;
  status: "pending" | "negotiating" | "offered" | "refused" | "timeout" | "error";
  /**
   * @maxItems 2
   */
  rounds: [] | [SellerRound] | [SellerRound, SellerRound];
  /**
   * @maxItems 2
   */
  final_offer_ids: [] | [Id] | [Id, Id];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SponsoredPlacement".
 */
export interface SponsoredPlacement {
  seller_id: Id;
  campaign_id: Id;
  label: "Sponsored";
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DiscoveryProductCheck".
 */
export interface DiscoveryProductCheck {
  product_id: Id;
  reason:
    "required_mismatch" | "required_attribute_unknown" | "feature_mismatch" | "out_of_stock" | "delivery_too_late";
  preference_id: Id | null;
  missing_attribute: "size_class" | "color" | "shape" | "length_mm" | "width_mm" | "height_mm" | null;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DiscoveryExclusion".
 */
export interface DiscoveryExclusion {
  seller_id: Id;
  reason: "seller_unavailable" | "no_matching_product" | "insufficient_product_data";
  product_checks: DiscoveryProductCheck[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "OrchestrationResult".
 */
export interface OrchestrationResult {
  seller_agents: SellerAgent[];
  discovery_exclusions: DiscoveryExclusion[];
  sponsored_placement: SponsoredPlacement | null;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "OfferItem".
 */
export interface OfferItem {
  product_id: Id;
  category: ProductCategory;
  role: "primary" | "addon";
  quantity: 1;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Eligibility".
 */
export interface Eligibility {
  status: "eligible" | "needs_confirmation" | "rejected";
  reason_codes: EligibilityReasonCode[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Offer".
 */
export interface Offer {
  offer_id: Id;
  seller_id: Id;
  round: 1 | 2;
  variant: "standalone" | "bundle";
  baseline_offer_id: Id | null;
  /**
   * @minItems 1
   * @maxItems 2
   */
  items: [OfferItem] | [OfferItem, OfferItem];
  /**
   * @minItems 1
   */
  primary_features: [string, ...string[]];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
  eligibility: Eligibility;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RankedOffer".
 */
export interface RankedOffer {
  rank: number;
  offer_id: Id;
  reason: string;
  /**
   * @maxItems 5
   */
  tradeoffs:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ApiError".
 */
export interface ApiError {
  code: string;
  message: string;
  fields: string[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RequestSnapshot".
 */
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
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "AcceptDecisionResult".
 */
export interface AcceptDecisionResult {
  action: "accept";
  request_id: Id;
  status: "accepted";
  selected_offer_id: Id;
  expires_at: Timestamp;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RejectDecisionResult".
 */
export interface RejectDecisionResult {
  action: "reject";
  request_id: Id;
  status: "rejected";
  feedback: string;
  source_documents: DocumentBundle;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RedemptionReceipt".
 */
export interface RedemptionReceipt {
  redemption_id: Id;
  request_id: Id;
  offer_id: Id;
  seller_id: Id;
  status: "redeemed";
  mode: "virtual_market";
  total_price_twd: MoneyTwd;
  redeemed_at: Timestamp;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ErrorResponse".
 */
export interface ErrorResponse {
  error: ApiError;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerRFQ".
 */
export interface SellerRFQ {
  request_id: Id;
  seller_id: Id;
  round: 1 | 2;
  category: "mouse";
  /**
   * @minItems 1
   */
  required_features: [string, ...string[]];
  /**
   * @minItems 1
   */
  candidate_product_ids: [Id, ...Id[]];
  product_preferences: RFQProductPreference[];
  pending_checks: ("availability" | "delivery")[];
  delivery_days_max: number;
  /**
   * @maxItems 1
   */
  allowed_addon_categories: [] | ["mouse_pad"];
  target_total_twd: number | null;
  /**
   * @maxItems 2
   */
  previous_offer_ids: [] | [Id] | [Id, Id];
}
/**
 * Untrusted Seller proposal. The Backend assigns offer_id and eligibility after validation.
 *
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerOfferDraft".
 */
export interface SellerOfferDraft {
  draft_ref: Id;
  variant: "standalone" | "bundle";
  baseline_draft_ref: Id | null;
  /**
   * @minItems 1
   * @maxItems 2
   */
  items: [OfferItem] | [OfferItem, OfferItem];
  /**
   * @minItems 1
   */
  primary_features: [string, ...string[]];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerNegotiationResult".
 */
export interface SellerNegotiationResult {
  request_id: Id;
  seller_id: Id;
  round: 1 | 2;
  outcome: "offered" | "refused" | "timeout" | "error";
  /**
   * @maxItems 2
   */
  drafts: [] | [SellerOfferDraft] | [SellerOfferDraft, SellerOfferDraft];
  message: string;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerTrustEntry".
 */
export interface SellerTrustEntry {
  seller_id: Id;
  trust: Trust;
}
/**
 * Campaign and Sponsored data are intentionally absent.
 *
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "EvaluatorInput".
 */
export interface EvaluatorInput {
  request_id: Id;
  evaluated_at: Timestamp;
  intent: NormalizedIntent;
  /**
   * @minItems 1
   */
  offers: [EligibleOffer, ...EligibleOffer[]];
  seller_trust: SellerTrustEntry[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "EvaluatorOutput".
 */
export interface EvaluatorOutput {
  /**
   * @minItems 1
   */
  ranked_offers: [RankedOffer, ...RankedOffer[]];
}
