/* Generated from contracts/a2a-commerce.v0.3.schema.json. Do not edit by hand. */

/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "MoneyTwd".
 */
export type MoneyTwd = number;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ProductPreference".
 */
export type ProductPreference = CategoricalProductPreference | RangeProductPreference;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationPolicy".
 */
export type NegotiationPolicy =
  | {
      bundle_mode: "disabled";
      allowed_addon_categories: unknown[];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: "related_no_extra_cost";
      allowed_addon_categories: "mouse_pad"[];
      max_addon_increment_twd: 0;
    }
  | {
      bundle_mode: "related_with_cap";
      allowed_addon_categories: "mouse_pad"[];
      max_addon_increment_twd: number;
    };
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationRound".
 */
export type NegotiationRound = number;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "BranchStopReason".
 */
export type BranchStopReason =
  | null
  | "seller_final"
  | "refused"
  | "timeout"
  | "error"
  | "no_adjustment"
  | "max_rounds"
  | "global_deadline"
  | "call_budget"
  | "token_budget";
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
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
  | "orchestrating"
  | "negotiating"
  | "evaluating"
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
 * via the `definition` "RejectDecision".
 */
export type RejectDecision = RejectDecision1 & {
  action: "reject";
  feedback: string;
  selection_version?: 1;
  rejected_offer_ids?: Id[];
};
export type RejectDecision1 =
  | {
      feedback?: string;
      [k: string]: unknown;
    }
  | {
      rejected_offer_ids: Id[];
      feedback?: "";
      [k: string]: unknown;
    };
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DecisionResult".
 */
export type DecisionResult = AcceptDecisionResult | RejectDecisionResult;
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RejectDecisionResult".
 */
export type RejectDecisionResult = RejectDecisionResult1 & {
  action: "reject";
  request_id: Id;
  status: "rejected";
  feedback: string;
  source_documents: DocumentBundle;
  selection_version?: 1;
  rejected_offer_ids?: Id[];
};
export type RejectDecisionResult1 =
  | {
      feedback?: string;
      [k: string]: unknown;
    }
  | {
      rejected_offer_ids: Id[];
      feedback?: "";
      [k: string]: unknown;
    };
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
      values: string[];
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
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "ImprovementStatus".
 */
export type ImprovementStatus = null | {
  improvement_id: Id;
  request_id: Id;
  mode: "accepted_with_rejections" | "all_rejected";
  status: "queued" | "running" | "ready" | "needs_clarification" | "failed";
  error: string | null;
  result: null | {
    intent_revision_id: Id;
    intent_state: "ready" | "draft";
    documents: {
      revision: number;
      intent_md: string;
      preference_md: string;
    };
    preference_updated: boolean;
    questions: string[];
  };
};

export interface A2ACommerceContracts {
  FormatterResult?: FormatterResult;
  NegotiationRound?: NegotiationRound;
  BranchStopReason?: BranchStopReason;
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
  MarketplacePrice?: MarketplacePrice;
  MarketplaceEvidence?: MarketplaceEvidence;
  MarketplaceSourceSnapshot?: MarketplaceSourceSnapshot;
  CatalogProductFixture?: CatalogProductFixture;
  SellerFixtureStore?: SellerFixtureStore;
  DemoScenarioSuite?: DemoScenarioSuite;
  CompetitiveTerms?: CompetitiveTerms;
  CompetitiveOfferReference?: CompetitiveOfferReference;
  SharedNegotiationContext?: SharedNegotiationContext;
  NegotiationOutput?: NegotiationOutput;
  SellerSalesProfile?: SellerSalesProfile;
  NegotiationProposal?: NegotiationProposal;
  NegotiationProposalResponse?: NegotiationProposalResponse;
  SellerBenefit?: SellerBenefit;
  SellerPersonaPolicy?: SellerPersonaPolicy;
  SellerSkuPolicy?: SellerSkuPolicy;
  ImprovementStatus?: ImprovementStatus;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "FormatterResult".
 */
export interface FormatterResult {
  parser_version: "formatter-rules-v0.1" | "formatter-llm-v0.1";
  status: "ready" | "needs_clarification";
  normalized_intent: NormalizedIntent | null;
  target_total_twd: number | null;
  questions: string[];
  warnings: string[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NormalizedIntent".
 */
export interface NormalizedIntent {
  category: "mouse";
  max_total_twd: MoneyTwd;
  delivery_days_max: number;
  required_features: string[];
  preferences: ("price_first" | "delivery_first" | "trust_first" | "after_sales_first")[];
  product_preferences: ProductPreference[];
  negotiation_policy: NegotiationPolicy;
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
  values: string[];
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
 * Immutable request-scoped original text, not generated Markdown or a durable preference update. See docs/INTENT_PREFERENCE_SPEC.md.
 *
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DocumentBundle".
 */
export interface DocumentBundle {
  revision: number;
  intent_md: string;
  preference_md: string;
}
/**
 * intent_md describes this purchase and its temporary constraints/preferences. preference_md is a request-bound preference snapshot; omission/empty text does not clear active SQLite product preferences. Neither field updates the durable profile.
 *
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
  selection_version?: 1;
  rejected_offer_ids?: Id[];
  feedback?: string;
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
  round: NegotiationRound;
  outcome: "offered" | "refused" | "timeout" | "error";
  /**
   * Seller explicitly ends this branch; valid only with an offered outcome.
   */
  is_final: boolean;
  offer_ids: Id[];
}
/**
 * One Buyer branch for a selected Seller. Backend assigns stop_reason; null means active. IDs and round order require cross-object validation.
 *
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerAgent".
 */
export interface SellerAgent {
  seller_id: Id;
  name: string;
  listing_rank: number;
  match_reason: string;
  candidate_products: ProductMatch[];
  trust: Trust;
  status: "pending" | "negotiating" | "offered" | "refused" | "timeout" | "error";
  rounds: SellerRound[];
  stop_reason: BranchStopReason;
  final_offer_ids: Id[];
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
  round: NegotiationRound;
  variant: "standalone" | "bundle";
  baseline_offer_id: Id | null;
  items: OfferItem[];
  primary_features: string[];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
  eligibility: Eligibility;
  benefits?: SellerBenefit[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerBenefit".
 */
export interface SellerBenefit {
  benefit_id: Id;
  kind:
    | "delivery_guarantee"
    | "late_compensation"
    | "future_coupon"
    | "return_extension"
    | "warranty_extension"
    | "priority_support"
    | "exchange_guarantee";
  description: string;
  amount_twd: number;
  duration_days: number;
  minimum_spend_twd: number;
  requires_membership: boolean;
  conditions: string;
  evidence_id: Id;
  simulation: true;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "RankedOffer".
 */
export interface RankedOffer {
  rank: number;
  offer_id: Id;
  reason: string;
  tradeoffs: string[];
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
  selection_version?: 1;
  rejected_offer_ids?: Id[];
  feedback?: string;
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
 * Seller-local RFQ. Optional competitive_terms contain only Backend-validated, unexpired, de-identified offers from the previous round. No private budget, competitor IDs, transcripts, trust or campaign data.
 *
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerRFQ".
 */
export interface SellerRFQ {
  request_id: Id;
  seller_id: Id;
  round: NegotiationRound;
  category: "mouse";
  required_features: string[];
  candidate_product_ids: Id[];
  product_preferences: RFQProductPreference[];
  pending_checks: ("availability" | "delivery")[];
  delivery_days_max: number;
  allowed_addon_categories: "mouse_pad"[];
  target_total_twd: number | null;
  previous_offer_ids: Id[];
  competitive_terms?: CompetitiveTerms[];
  proposal?: NegotiationProposal;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "CompetitiveTerms".
 */
export interface CompetitiveTerms {
  comparison_key: string;
  primary_product: {
    brand: string;
    model: string;
    features: string[];
    attributes: ProductAttributes;
  };
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms: {
    warranty_months: number;
    return_days: number;
    payment_obligation: "one_time";
  };
  expires_at: Timestamp;
  variant: "standalone" | "bundle";
  addon_categories: "mouse_pad"[];
  differences: string[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationProposal".
 */
export interface NegotiationProposal {
  kind: "lower_price" | "add_gift" | "exchange_gift" | "compare" | "request_benefit";
  variant: "standalone" | "bundle";
  target_total_twd: number | null;
  reference_offer_id: Id | null;
  benefit_kind?:
    | null
    | "delivery_guarantee"
    | "late_compensation"
    | "future_coupon"
    | "return_extension"
    | "warranty_extension"
    | "priority_support"
    | "exchange_guarantee";
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
  items: OfferItem[];
  primary_features: string[];
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms_id: Id;
  optional_addons: boolean;
  expires_at: Timestamp;
  benefits?: SellerBenefit[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerNegotiationResult".
 */
export interface SellerNegotiationResult {
  request_id: Id;
  seller_id: Id;
  round: NegotiationRound;
  outcome: "offered" | "refused" | "timeout" | "error";
  /**
   * Seller explicitly ends this branch; valid only with an offered outcome.
   */
  is_final: boolean;
  drafts: SellerOfferDraft[];
  message: string;
  /**
   * Optional explicit withdrawal of this Seller's own previously issued offers. Backend verifies ownership; invalid new drafts alone never withdraw old offers.
   */
  withdrawn_offer_ids?: Id[];
  proposal_response?: NegotiationProposalResponse;
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationProposalResponse".
 */
export interface NegotiationProposalResponse {
  status: "accepted" | "countered" | "declined";
  exchange_discount_twd: number;
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
  offers: EligibleOffer[];
  seller_trust: SellerTrustEntry[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "EvaluatorOutput".
 */
export interface EvaluatorOutput {
  ranked_offers: RankedOffer[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "MarketplacePrice".
 */
export interface MarketplacePrice {
  amount: number;
  currency: "TWD" | "EUR" | "USD";
  includes_tax: "yes" | "no" | "unknown";
  includes_shipping: "yes" | "no" | "unknown";
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "MarketplaceEvidence".
 */
export interface MarketplaceEvidence {
  source_id: Id;
  marketplace: "shopee_tw" | "amazon_ie" | "logitech_official";
  source_type: "marketplace_listing" | "marketplace_search_result" | "manufacturer_spec";
  product_key: Id;
  title: string;
  url: string;
  retrieved_at: Timestamp;
  observed_at: Timestamp | null;
  freshness: "current" | "current_cached" | "stale_cached_reference";
  availability: "listed" | "in_stock" | "sold_out" | "unknown" | "not_applicable";
  price: MarketplacePrice | null;
  facts: string[];
  notes: string[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "MarketplaceSourceSnapshot".
 */
export interface MarketplaceSourceSnapshot {
  fixture_version: "0.2";
  snapshot_id: Id;
  retrieved_at: Timestamp;
  purpose: string;
  usage_policy: {
    live_checkout_allowed: false;
    price_guarantee: false;
    taiwan_demo_price_sources: "shopee_tw"[];
    reference_only_sources: ("amazon_ie" | "logitech_official")[];
    notes: string[];
  };
  sources: MarketplaceEvidence[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "CatalogProductFixture".
 */
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
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerFixtureStore".
 */
export interface SellerFixtureStore {
  fixture_version: "0.3";
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
    payment_obligation: "one_time";
  }[];
  sellers: {
    seller_id: Id;
    name: string;
    enabled: boolean;
    strategy: {
      type:
        "lowest_price_slow_delivery" | "premium_fast_delivery" | "value_bundle" | "balanced_delivery" | "firm_price";
      round_discounts_twd: number[];
      final_round: NegotiationRound | null;
      bundle_mode: "none" | "free_optional_mouse_pad";
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
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "DemoScenarioSuite".
 */
export interface DemoScenarioSuite {
  fixture_version: "0.3";
  catalog_fixture: "sellers.json";
  source_snapshot: "marketplace-source-snapshot.json";
  canonical_flow_fixture: "happy-path.json";
  scenarios: {
    scenario_id: Id;
    title: string;
    intent: {
      max_total_twd: MoneyTwd;
      delivery_days_max: number;
      required_features: string[];
      preferences: ("price_first" | "delivery_first" | "trust_first" | "after_sales_first")[];
      required_color: string;
      preferred_shape: string | null;
      bundle_mode: "disabled" | "related_no_extra_cost" | "related_with_cap";
    };
    runtime_faults: string[];
    expected: {
      request_status: Status;
      seller_statuses: {
        seller_a: "offered" | "refused" | "timeout" | "error" | "no_match";
        seller_b: "offered" | "refused" | "timeout" | "error" | "no_match";
        seller_c: "offered" | "refused" | "timeout" | "error" | "no_match";
        seller_d: "offered" | "refused" | "timeout" | "error" | "no_match";
        seller_e: "offered" | "refused" | "timeout" | "error" | "no_match";
      };
      eligible_offer_ids: Id[];
      recommended_offer_id: Id | null;
      reason_codes: EligibilityReasonCode[];
    };
  }[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "CompetitiveOfferReference".
 */
export interface CompetitiveOfferReference {
  seller_id: Id;
  offer_id: Id;
  comparison_key: string;
  primary_product: {
    brand: string;
    model: string;
    features: string[];
    attributes: ProductAttributes;
  };
  total_price_twd: MoneyTwd;
  delivery_days: number;
  terms: {
    warranty_months: number;
    return_days: number;
    payment_obligation: "one_time";
  };
  expires_at: Timestamp;
  variant: "standalone" | "bundle";
  addon_categories: "mouse_pad"[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SharedNegotiationContext".
 */
export interface SharedNegotiationContext {
  request_id: Id;
  context_revision: number;
  completed_round: number;
  as_of: Timestamp;
  offers: CompetitiveOfferReference[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "NegotiationOutput".
 */
export interface NegotiationOutput {
  request_id: Id;
  status: "evaluating" | "needs_confirmation" | "no_match";
  seller_agents: SellerAgent[];
  offers: Offer[];
  eligible_offer_ids: Id[];
  confirmation_offer_ids: Id[];
  completed_rounds: number;
  usage: {
    calls: number;
    reserved_tokens: number;
    actual_tokens: number;
  };
  stop_reason: null | "global_deadline" | "call_budget" | "token_budget";
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerSalesProfile".
 */
export interface SellerSalesProfile {
  seller_id: Id;
  label: string;
  description: string;
  bundle_discount_twd: number;
  always_offer_bundle: boolean;
  addon_product_id: Id | null;
  /**
   * Request-wide maximum gift-to-cash concession; defaults to zero. Private Seller policy.
   */
  gift_exchange_discount_twd?: number;
  persona_policy?: SellerPersonaPolicy;
  sku_policies?: SellerSkuPolicy[];
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerPersonaPolicy".
 */
export interface SellerPersonaPolicy {
  persona: "price_optimizer" | "speed_seller" | "bundle_curator" | "loyalty_builder" | "margin_guardian";
  objective: string;
  sku_ids: Id[];
  price_mode: "stepped" | "protected" | "bundle";
  base_price_twd: number;
  round_discounts_twd: number[];
  final_round: number;
  quote_ttl_seconds: number;
  gift_from_round: number;
  benefit_schedule: {
    from_round: number;
    benefit: SellerBenefit;
  }[];
  decision_mode?: "scheduled" | "bounded";
}
/**
 * This interface was referenced by `A2ACommerceContracts`'s JSON-Schema
 * via the `definition` "SellerSkuPolicy".
 */
export interface SellerSkuPolicy {
  product_id: Id;
  policy_version: string;
  opening_discount_cap_twd: number;
  max_discount_per_step_twd: number;
  max_total_discount_twd: number;
  max_concession_count: number;
  unit_cost_twd: number;
  shipping_cost_twd: number;
  min_margin_bps: number;
  gift_cost_budget_twd: number;
  gift_exchange_discount_cap_twd: number;
  total_concession_budget_twd: number;
  voucher_budget_twd: number;
  inventory_pressure: "low" | "normal" | "high";
  addon_costs: {
    product_id: Id;
    cost_twd: number;
  }[];
  benefit_costs: {
    benefit_id: Id;
    cost_twd: number;
  }[];
}
