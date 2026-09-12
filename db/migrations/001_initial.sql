PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE marketplace_sources (
  source_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee_tw', 'amazon_ie', 'logitech_official')),
  source_type TEXT NOT NULL CHECK (source_type IN ('marketplace_listing', 'marketplace_search_result', 'manufacturer_spec')),
  product_key TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  observed_at TEXT,
  freshness TEXT NOT NULL CHECK (freshness IN ('current', 'current_cached', 'stale_cached_reference')),
  availability TEXT NOT NULL CHECK (availability IN ('listed', 'in_stock', 'sold_out', 'unknown', 'not_applicable')),
  price_amount REAL CHECK (price_amount IS NULL OR price_amount > 0),
  price_currency TEXT CHECK (price_currency IS NULL OR price_currency IN ('TWD', 'EUR', 'USD')),
  includes_tax TEXT CHECK (includes_tax IS NULL OR includes_tax IN ('yes', 'no', 'unknown')),
  includes_shipping TEXT CHECK (includes_shipping IS NULL OR includes_shipping IN ('yes', 'no', 'unknown')),
  facts_json TEXT NOT NULL CHECK (json_valid(facts_json)),
  notes_json TEXT NOT NULL CHECK (json_valid(notes_json)),
  CHECK ((price_amount IS NULL) = (price_currency IS NULL)),
  CHECK (source_type <> 'manufacturer_spec' OR price_amount IS NULL)
) STRICT;

CREATE TABLE sellers (
  seller_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('lowest_price_slow_delivery', 'premium_fast_delivery', 'value_bundle')),
  round_1_discount_twd INTEGER NOT NULL CHECK (round_1_discount_twd >= 0),
  round_2_discount_twd INTEGER NOT NULL CHECK (round_2_discount_twd >= round_1_discount_twd),
  bundle_mode TEXT NOT NULL CHECK (bundle_mode IN ('none', 'free_optional_mouse_pad')),
  personal_band TEXT NOT NULL CHECK (personal_band IN ('positive', 'neutral', 'negative')),
  personal_rating REAL CHECK (personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5),
  personal_count INTEGER NOT NULL CHECK (personal_count >= 0),
  marketplace_rating REAL CHECK (marketplace_rating IS NULL OR marketplace_rating BETWEEN 1 AND 5),
  marketplace_count INTEGER NOT NULL CHECK (marketplace_count >= 0),
  CHECK ((personal_count = 0 AND personal_rating IS NULL) OR (personal_count > 0 AND personal_rating IS NOT NULL)),
  CHECK ((marketplace_count = 0 AND marketplace_rating IS NULL) OR (marketplace_count > 0 AND marketplace_rating IS NOT NULL))
) STRICT;

CREATE TABLE terms (
  terms_id TEXT PRIMARY KEY,
  warranty_months INTEGER NOT NULL CHECK (warranty_months >= 0),
  return_days INTEGER NOT NULL CHECK (return_days >= 0),
  payment_obligation TEXT NOT NULL CHECK (payment_obligation = 'one_time')
) STRICT;

CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('mouse', 'mouse_pad')),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  name TEXT NOT NULL,
  features_json TEXT NOT NULL CHECK (json_valid(features_json)),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  source_price_twd INTEGER NOT NULL CHECK (source_price_twd > 0)
) STRICT;

CREATE TABLE product_sources (
  product_id TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES marketplace_sources(source_id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, source_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE seller_inventory (
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  list_price_twd INTEGER NOT NULL CHECK (list_price_twd > 0),
  floor_price_twd INTEGER NOT NULL CHECK (floor_price_twd > 0 AND floor_price_twd <= list_price_twd),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  delivery_days INTEGER NOT NULL CHECK (delivery_days >= 1),
  terms_id TEXT NOT NULL REFERENCES terms(terms_id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (seller_id, product_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE campaigns (
  campaign_id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  target_category TEXT NOT NULL CHECK (target_category IN ('mouse', 'mouse_pad')),
  bid_twd INTEGER NOT NULL CHECK (bid_twd > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  CHECK (ends_at > starts_at)
) STRICT;

CREATE TABLE requests (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  parent_request_id TEXT REFERENCES requests(request_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  intent_md TEXT NOT NULL,
  preference_md TEXT NOT NULL DEFAULT '',
  normalized_intent_json TEXT NOT NULL CHECK (json_valid(normalized_intent_json)),
  status TEXT NOT NULL CHECK (status IN ('formatting', 'orchestrating', 'negotiating', 'evaluating', 'awaiting_user', 'needs_clarification', 'needs_confirmation', 'no_match', 'failed', 'accepted', 'superseded', 'redeemed')),
  published_snapshot_json TEXT CHECK (published_snapshot_json IS NULL OR json_valid(published_snapshot_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (parent_request_id, revision)
) STRICT;

CREATE TABLE request_sellers (
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
  listing_rank INTEGER NOT NULL CHECK (listing_rank >= 1),
  match_reason TEXT NOT NULL,
  candidate_products_json TEXT NOT NULL CHECK (json_valid(candidate_products_json)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'negotiating', 'offered', 'refused', 'timeout', 'error', 'no_match')),
  final_offer_ids_json TEXT NOT NULL CHECK (json_valid(final_offer_ids_json)),
  PRIMARY KEY (request_id, seller_id),
  UNIQUE (request_id, listing_rank)
) STRICT, WITHOUT ROWID;

CREATE TABLE negotiation_rounds (
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
  round INTEGER NOT NULL CHECK (round IN (1, 2)),
  outcome TEXT NOT NULL CHECK (outcome IN ('offered', 'refused', 'timeout', 'error')),
  buyer_message TEXT NOT NULL,
  seller_message TEXT NOT NULL,
  drafts_json TEXT NOT NULL CHECK (json_valid(drafts_json)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (request_id, seller_id, round),
  FOREIGN KEY (request_id, seller_id) REFERENCES request_sellers(request_id, seller_id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE offers (
  offer_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
  round INTEGER NOT NULL CHECK (round IN (1, 2)),
  variant TEXT NOT NULL CHECK (variant IN ('standalone', 'bundle')),
  baseline_offer_id TEXT REFERENCES offers(offer_id) ON DELETE RESTRICT,
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  primary_features_json TEXT NOT NULL CHECK (json_valid(primary_features_json)),
  total_price_twd INTEGER NOT NULL CHECK (total_price_twd > 0),
  delivery_days INTEGER NOT NULL CHECK (delivery_days >= 1),
  terms_id TEXT NOT NULL REFERENCES terms(terms_id) ON DELETE RESTRICT,
  optional_addons INTEGER NOT NULL CHECK (optional_addons IN (0, 1)),
  expires_at TEXT NOT NULL,
  eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('eligible', 'ineligible')),
  eligibility_reason_codes_json TEXT NOT NULL CHECK (json_valid(eligibility_reason_codes_json)),
  created_at TEXT NOT NULL,
  CHECK ((variant = 'standalone' AND baseline_offer_id IS NULL AND optional_addons = 0) OR (variant = 'bundle' AND baseline_offer_id IS NOT NULL AND optional_addons = 1)),
  UNIQUE (offer_id, request_id),
  FOREIGN KEY (request_id, seller_id) REFERENCES request_sellers(request_id, seller_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE evaluations (
  evaluation_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'deterministic_fallback')),
  model TEXT,
  evaluated_at TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  ranked_offers_json TEXT NOT NULL CHECK (json_valid(ranked_offers_json)),
  output_valid INTEGER NOT NULL CHECK (output_valid IN (0, 1)),
  validation_error TEXT
) STRICT;

CREATE TABLE feedback_events (
  feedback_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES offers(offer_id) ON DELETE RESTRICT,
  gesture TEXT NOT NULL CHECK (gesture = 'left_swipe'),
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN ('too_expensive', 'too_slow', 'wrong_color', 'wrong_shape', 'wrong_brand', 'bundle_unwanted', 'low_trust', 'other')),
  reason_text TEXT,
  implicit_only INTEGER NOT NULL CHECK (implicit_only IN (0, 1)),
  preference_update_json TEXT CHECK (preference_update_json IS NULL OR json_valid(preference_update_json)),
  child_request_id TEXT REFERENCES requests(request_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK ((implicit_only = 1 AND reason_code IS NULL AND reason_text IS NULL) OR (implicit_only = 0 AND (reason_code IS NOT NULL OR reason_text IS NOT NULL))),
  FOREIGN KEY (offer_id, request_id) REFERENCES offers(offer_id, request_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE user_preferences (
  preference_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('in', 'not_in', 'range', 'prefer', 'avoid')),
  values_json TEXT NOT NULL CHECK (json_valid(values_json)),
  strength TEXT NOT NULL CHECK (strength IN ('weak', 'preferred', 'required')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_feedback_id TEXT REFERENCES feedback_events(feedback_id) ON DELETE SET NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE decisions (
  decision_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  offer_id TEXT REFERENCES offers(offer_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('accept', 'reject_all')),
  created_at TEXT NOT NULL,
  CHECK ((action = 'accept' AND offer_id IS NOT NULL) OR (action = 'reject_all' AND offer_id IS NULL)),
  UNIQUE (decision_id, request_id, offer_id),
  FOREIGN KEY (offer_id, request_id) REFERENCES offers(offer_id, request_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE redemptions (
  redemption_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE REFERENCES decisions(decision_id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE RESTRICT,
  offer_id TEXT NOT NULL REFERENCES offers(offer_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  total_price_twd INTEGER CHECK (total_price_twd IS NULL OR total_price_twd > 0),
  failure_code TEXT,
  redeemed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (decision_id, request_id, offer_id) REFERENCES decisions(decision_id, request_id, offer_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
  route TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  response_status INTEGER CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body_json TEXT CHECK (response_body_json IS NULL OR json_valid(response_body_json)),
  resource_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, method, route, idempotency_key)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_marketplace_sources_product ON marketplace_sources(product_key, marketplace);
CREATE INDEX idx_inventory_product ON seller_inventory(product_id);
CREATE INDEX idx_campaigns_active ON campaigns(enabled, starts_at, ends_at);
CREATE INDEX idx_requests_user_created ON requests(user_id, created_at DESC);
CREATE INDEX idx_requests_parent ON requests(parent_request_id);
CREATE INDEX idx_rounds_request ON negotiation_rounds(request_id, round);
CREATE INDEX idx_offers_request_eligible ON offers(request_id, eligibility_status, expires_at);
CREATE INDEX idx_feedback_request_created ON feedback_events(request_id, created_at DESC);
CREATE INDEX idx_preferences_user_active ON user_preferences(user_id, active, attribute);
CREATE INDEX idx_evaluations_request ON evaluations(request_id, evaluated_at DESC);

CREATE TRIGGER offers_are_immutable
BEFORE UPDATE ON offers
BEGIN
  SELECT RAISE(ABORT, 'offers are immutable; create a new offer_id');
END;

CREATE TRIGGER published_snapshots_are_immutable
BEFORE UPDATE OF published_snapshot_json ON requests
WHEN OLD.published_snapshot_json IS NOT NULL
  AND NEW.published_snapshot_json IS NOT OLD.published_snapshot_json
BEGIN
  SELECT RAISE(ABORT, 'published request snapshots are immutable; create a child request');
END;
