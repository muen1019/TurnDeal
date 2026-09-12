CREATE TABLE seller_sku_policies (
  seller_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  policy_json TEXT NOT NULL CHECK(json_valid(policy_json)),
  PRIMARY KEY (seller_id, product_id),
  FOREIGN KEY (seller_id, product_id) REFERENCES seller_inventory(seller_id, product_id)
) STRICT;
