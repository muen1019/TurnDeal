CREATE TABLE seller_persona_policies (
  seller_id TEXT PRIMARY KEY REFERENCES sellers(seller_id),
  policy_json TEXT NOT NULL CHECK(json_valid(policy_json))
) STRICT;

-- Authoritative simulation capabilities; evidence is versioned and checked again
-- before evaluation. Stock is availability, not a reservation or a purchase.
CREATE TABLE seller_benefit_catalog (
  benefit_id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  evidence_id TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  available_units INTEGER NOT NULL CHECK(available_units >= 0)
) STRICT;
