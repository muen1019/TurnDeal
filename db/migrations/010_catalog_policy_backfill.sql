CREATE TABLE seller_listing_bindings (
  snapshot_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  source_product_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, listing_id),
  UNIQUE (seller_id, product_id),
  FOREIGN KEY (seller_id, product_id) REFERENCES seller_inventory(seller_id, product_id)
) STRICT;

CREATE TABLE seller_policy_seeds (
  version TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
