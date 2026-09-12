-- Private seller preferences. A discount applies to an optional bundle only;
-- standalone price bounds reserve this amount above the primary product floor.
ALTER TABLE sellers ADD COLUMN bundle_discount_twd INTEGER NOT NULL DEFAULT 0
  CHECK (bundle_discount_twd >= 0);
ALTER TABLE sellers ADD COLUMN always_offer_bundle INTEGER NOT NULL DEFAULT 0
  CHECK (always_offer_bundle IN (0, 1));
