/* Generated from purchase.v1.schema.json; do not edit. */

export type SharedId = string;
export type SharedNegotiationRound = number;
export type SharedProductCategory = 'mouse' | 'mouse_pad';
export type SharedMoneyTwd = number;
export type SharedTimestamp = string;
export type SharedEligibilityReasonCode =
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

export interface PurchaseTypes {
  PurchaseView: PurchaseView;
  CheckoutUpdate: CheckoutUpdate;
  PurchaseComplete: PurchaseComplete;
}
export interface PurchaseView {
  purchase_id: string;
  request_id: string;
  offer_id: string;
  seller_id: string;
  mode: 'test';
  payment_execution: 'simulated';
  status:
    | 'creating'
    | 'needs_input'
    | 'ready'
    | 'submitting'
    | 'reconciling'
    | 'completed'
    | 'canceled'
    | 'expired'
    | 'blocked';
  checkout_session_id: string | null;
  checkout_revision: number;
  expires_at: string;
  offer: SharedOffer;
  checkout: Checkout | null;
  order: PurchaseOrder | null;
  error: PurchaseError | null;
  allowed_actions: ('update' | 'complete' | 'cancel' | 'get')[];
  confirmation_token?: string;
  confirmation_expires_at?: string;
}
export interface SharedOffer {
  offer_id: SharedId;
  seller_id: SharedId;
  round: SharedNegotiationRound;
  variant: 'standalone' | 'bundle';
  baseline_offer_id: SharedId | null;
  items: SharedOfferItem[];
  primary_features: string[];
  total_price_twd: SharedMoneyTwd;
  delivery_days: number;
  terms_id: SharedId;
  optional_addons: boolean;
  expires_at: SharedTimestamp;
  eligibility: SharedEligibility;
  benefits?: SharedSellerBenefit[];
}
export interface SharedOfferItem {
  product_id: SharedId;
  category: SharedProductCategory;
  role: 'primary' | 'addon';
  quantity: 1;
}
export interface SharedEligibility {
  status: 'eligible' | 'needs_confirmation' | 'rejected';
  reason_codes: SharedEligibilityReasonCode[];
}
export interface SharedSellerBenefit {
  benefit_id: SharedId;
  kind:
    | 'delivery_guarantee'
    | 'late_compensation'
    | 'future_coupon'
    | 'return_extension'
    | 'warranty_extension'
    | 'priority_support'
    | 'exchange_guarantee';
  description: string;
  amount_twd: number;
  duration_days: number;
  minimum_spend_twd: number;
  requires_membership: boolean;
  conditions: string;
  evidence_id: SharedId;
  simulation: true;
}
export interface Checkout {
  currency: 'twd';
  amount_minor: number;
  total_price_twd: number;
  line_items: AcpLineItem[];
  buyer: Buyer | null;
  fulfillment_address: Address | null;
  fulfillment_options: AcpFulfillmentOptionShipping[];
  fulfillment_option_id: string | null;
  terms: string;
}
export interface AcpLineItem {
  id: string;
  item: AcpItem;
  base_amount: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  name?: string;
  description?: string;
  images?: string[];
  /**
   * The unit price of the line item in the smallest currency unit (e.g., cents for USD)
   */
  unit_amount?: number;
  disclosures?: AcpDisclosure[];
  custom_attributes?: AcpCustomAttribute[];
  marketplace_seller_details?: AcpMarketplaceSellerDetails;
}
export interface AcpItem {
  id: string;
  quantity: number;
}
export interface AcpDisclosure {
  type: 'disclaimer';
  content_type: 'plain' | 'markdown';
  content: string;
}
export interface AcpCustomAttribute {
  display_name: string;
  value: string;
}
export interface AcpMarketplaceSellerDetails {
  name: string;
}
export interface Buyer {
  name: string;
  email: string;
  phone_number?: string;
}
export interface Address {
  name: string;
  line_one: string;
  line_two?: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  phone_number?: string;
}
export interface AcpFulfillmentOptionShipping {
  type: 'shipping';
  id: string;
  title: string;
  subtitle?: string;
  carrier?: string;
  earliest_delivery_time?: string;
  latest_delivery_time?: string;
  subtotal?: number;
  tax?: number;
  total: number;
}
export interface PurchaseOrder {
  order_id: string;
  merchant_order_id: string;
  checkout_session_id: string;
  created_at: string;
  total_price_twd: number;
  payment_status: 'simulated_succeeded';
}
export interface PurchaseError {
  code: string;
  message: string;
  fields: string[];
}
export interface CheckoutUpdate {
  buyer?: Buyer;
  fulfillment_address?: Address;
  fulfillment_option_id?: string;
}
export interface PurchaseComplete {
  confirmation_token: string;
}
