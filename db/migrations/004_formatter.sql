CREATE TABLE formatter_runs (
  request_id TEXT PRIMARY KEY REFERENCES requests(request_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  idempotency_key TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  preference_snapshot_json TEXT NOT NULL CHECK(json_valid(preference_snapshot_json)),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
) STRICT;
CREATE TRIGGER formatter_run_immutable BEFORE UPDATE ON formatter_runs
BEGIN SELECT RAISE(ABORT, 'formatter runs are immutable'); END;
CREATE TRIGGER formatted_request_immutable BEFORE UPDATE ON requests
WHEN EXISTS (SELECT 1 FROM formatter_runs WHERE request_id=OLD.request_id)
 AND (NEW.user_id != OLD.user_id OR NEW.intent_md != OLD.intent_md OR NEW.preference_md != OLD.preference_md
   OR NEW.normalized_intent_json != OLD.normalized_intent_json OR NEW.revision != OLD.revision)
BEGIN SELECT RAISE(ABORT, 'formatted request is immutable; create a new request'); END;
