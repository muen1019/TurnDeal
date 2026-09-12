ALTER TABLE sellers ADD COLUMN gift_exchange_discount_twd INTEGER NOT NULL DEFAULT 0
  CHECK (gift_exchange_discount_twd BETWEEN 0 AND 1000);
