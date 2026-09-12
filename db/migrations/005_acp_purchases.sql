CREATE TABLE purchases (
  purchase_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES requests(request_id),
  decision_id TEXT NOT NULL UNIQUE REFERENCES decisions(decision_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  seller_id TEXT NOT NULL,
  offer_id TEXT NOT NULL REFERENCES offers(offer_id),
  status TEXT NOT NULL CHECK(status IN ('creating','needs_input','ready','submitting','reconciling','completed','canceled','expired','blocked')),
  data_json TEXT NOT NULL CHECK(json_valid(data_json))
) STRICT;
CREATE TABLE purchase_operations (
  operation_id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(purchase_id),
  action TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK(json_valid(body_json)),
  state TEXT NOT NULL CHECK(state IN ('pending','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE UNIQUE INDEX one_pending_purchase_operation ON purchase_operations(purchase_id) WHERE state='pending';
CREATE TABLE purchase_http_keys (
  user_id TEXT NOT NULL, route TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL,
  purchase_id TEXT REFERENCES purchases(purchase_id), status INTEGER, response_json TEXT,
  PRIMARY KEY(user_id,route,key)
) STRICT;
CREATE TABLE commerce_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE merchant_quotes (
  purchase_id TEXT PRIMARY KEY REFERENCES purchases(purchase_id),
  seller_id TEXT NOT NULL, quote_json TEXT NOT NULL CHECK(json_valid(quote_json))
) STRICT;
CREATE TABLE merchant_checkout_sessions (
  session_id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(purchase_id),
  seller_id TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json))
) STRICT;
CREATE TABLE merchant_http_keys (
  seller_id TEXT NOT NULL, route TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL,
  status INTEGER NOT NULL, response_json TEXT NOT NULL,
  PRIMARY KEY(seller_id,route,key)
) STRICT;
CREATE TABLE merchant_inventory (
  seller_id TEXT NOT NULL, product_id TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0),
  PRIMARY KEY(seller_id,product_id)
) STRICT;
CREATE TABLE merchant_orders (
  order_id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES merchant_checkout_sessions(session_id),
  token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE purchase_orders (
  purchase_id TEXT PRIMARY KEY REFERENCES purchases(purchase_id),
  seller_id TEXT NOT NULL, external_order_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)), UNIQUE(seller_id,external_order_id)
) STRICT;
CREATE TABLE commerce_outbox (
  event_id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, body_json TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE commerce_inbox (seller_id TEXT NOT NULL, body_hash TEXT NOT NULL, PRIMARY KEY(seller_id,body_hash)) STRICT;
