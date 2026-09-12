-- v0.2: run through the migration runner with foreign keys disabled outside its transaction.
-- Preserve existing rows while widening rounds and replacing two fixed discounts.

CREATE TABLE sellers_v02 (
  seller_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('lowest_price_slow_delivery', 'premium_fast_delivery', 'value_bundle', 'balanced_delivery', 'firm_price')),
  round_discounts_json TEXT NOT NULL CHECK (json_valid(round_discounts_json) AND json_type(round_discounts_json) = 'array' AND json_array_length(round_discounts_json) = 5),
  final_round INTEGER CHECK (final_round IS NULL OR final_round BETWEEN 1 AND 5),
  bundle_mode TEXT NOT NULL CHECK (bundle_mode IN ('none', 'free_optional_mouse_pad')),
  personal_band TEXT NOT NULL CHECK (personal_band IN ('positive', 'neutral', 'negative')),
  personal_rating REAL CHECK (personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5),
  personal_count INTEGER NOT NULL CHECK (personal_count >= 0),
  marketplace_rating REAL CHECK (marketplace_rating IS NULL OR marketplace_rating BETWEEN 1 AND 5),
  marketplace_count INTEGER NOT NULL CHECK (marketplace_count >= 0),
  CHECK ((personal_count = 0 AND personal_rating IS NULL) OR (personal_count > 0 AND personal_rating IS NOT NULL)),
  CHECK ((marketplace_count = 0 AND marketplace_rating IS NULL) OR (marketplace_count > 0 AND marketplace_rating IS NOT NULL))
) STRICT;

INSERT INTO sellers_v02 (seller_id, name, enabled, strategy_type, bundle_mode, personal_band, personal_rating, personal_count, marketplace_rating, marketplace_count, round_discounts_json, final_round)
SELECT seller_id, name, enabled, strategy_type, bundle_mode, personal_band, personal_rating, personal_count, marketplace_rating, marketplace_count, json_array(round_1_discount_twd, round_2_discount_twd, round_2_discount_twd, round_2_discount_twd, round_2_discount_twd), NULL FROM sellers;
DROP TABLE sellers;
ALTER TABLE sellers_v02 RENAME TO sellers;

CREATE TABLE negotiation_rounds_v02 (
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
  outcome TEXT NOT NULL CHECK (outcome IN ('offered', 'refused', 'timeout', 'error')),
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1) AND (is_final = 0 OR outcome = 'offered')),
  buyer_message TEXT NOT NULL,
  seller_message TEXT NOT NULL,
  drafts_json TEXT NOT NULL CHECK (json_valid(drafts_json)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (request_id, seller_id, round),
  FOREIGN KEY (request_id, seller_id) REFERENCES request_sellers(request_id, seller_id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

INSERT INTO negotiation_rounds_v02 (request_id, seller_id, round, outcome, buyer_message, seller_message, drafts_json, started_at, completed_at, is_final)
SELECT request_id, seller_id, round, outcome, buyer_message, seller_message, drafts_json, started_at, completed_at, 0 FROM negotiation_rounds;
DROP TABLE negotiation_rounds;
ALTER TABLE negotiation_rounds_v02 RENAME TO negotiation_rounds;

CREATE TABLE offers_v02 (
  offer_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id) ON DELETE RESTRICT,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
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

INSERT INTO offers_v02 (offer_id, request_id, seller_id, round, variant, baseline_offer_id, items_json, primary_features_json, total_price_twd, delivery_days, terms_id, optional_addons, expires_at, eligibility_status, eligibility_reason_codes_json, created_at)
SELECT offer_id, request_id, seller_id, round, variant, baseline_offer_id, items_json, primary_features_json, total_price_twd, delivery_days, terms_id, optional_addons, expires_at, eligibility_status, eligibility_reason_codes_json, created_at FROM offers;
DROP TABLE offers;
ALTER TABLE offers_v02 RENAME TO offers;

ALTER TABLE request_sellers ADD COLUMN stop_reason TEXT
  CHECK (stop_reason IS NULL OR stop_reason IN ('seller_final', 'refused', 'timeout', 'error', 'no_adjustment', 'max_rounds', 'global_deadline', 'call_budget', 'token_budget'));

CREATE INDEX idx_rounds_request ON negotiation_rounds(request_id, round);
CREATE INDEX idx_offers_request_eligible ON offers(request_id, eligibility_status, expires_at);

CREATE TRIGGER offers_are_immutable
BEFORE UPDATE ON offers
BEGIN
  SELECT RAISE(ABORT, 'offers are immutable; create a new offer_id');
END;

CREATE TRIGGER request_sellers_limit_insert
BEFORE INSERT ON request_sellers
WHEN NEW.listing_rank NOT BETWEEN 1 AND 5
  OR (SELECT count(*) FROM request_sellers WHERE request_id = NEW.request_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'at most five Seller branches per request');
END;

CREATE TRIGGER request_sellers_limit_update
BEFORE UPDATE OF request_id, listing_rank ON request_sellers
WHEN NEW.listing_rank NOT BETWEEN 1 AND 5
  OR (NEW.request_id <> OLD.request_id AND (SELECT count(*) FROM request_sellers WHERE request_id = NEW.request_id) >= 5)
BEGIN
  SELECT RAISE(ABORT, 'at most five Seller branches per request');
END;

CREATE TRIGGER seller_discount_schedule_insert
BEFORE INSERT ON sellers
WHEN EXISTS (SELECT 1 FROM json_each(NEW.round_discounts_json) WHERE type <> 'integer' OR value < 0)
  OR EXISTS (SELECT 1 FROM json_each(NEW.round_discounts_json) a JOIN json_each(NEW.round_discounts_json) b ON b.key = a.key + 1 WHERE b.value < a.value)
BEGIN
  SELECT RAISE(ABORT, 'discount schedule must contain five nondecreasing nonnegative integers');
END;

CREATE TRIGGER seller_discount_schedule_update
BEFORE UPDATE OF round_discounts_json ON sellers
WHEN EXISTS (SELECT 1 FROM json_each(NEW.round_discounts_json) WHERE type <> 'integer' OR value < 0)
  OR EXISTS (SELECT 1 FROM json_each(NEW.round_discounts_json) a JOIN json_each(NEW.round_discounts_json) b ON b.key = a.key + 1 WHERE b.value < a.value)
BEGIN
  SELECT RAISE(ABORT, 'discount schedule must contain five nondecreasing nonnegative integers');
END;
