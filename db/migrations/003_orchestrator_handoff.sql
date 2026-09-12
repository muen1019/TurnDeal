CREATE TABLE orchestrator_handoffs (
  handoff_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  request_id TEXT NOT NULL REFERENCES requests(request_id),
  idempotency_key TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  status TEXT NOT NULL CHECK(status IN ('prepared','dispatching','dispatched')),
  results_json TEXT CHECK(results_json IS NULL OR json_valid(results_json)),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, request_id, idempotency_key)
) STRICT;
CREATE TRIGGER orchestrator_handoff_plan_immutable
BEFORE UPDATE ON orchestrator_handoffs
WHEN NEW.handoff_id != OLD.handoff_id OR NEW.user_id != OLD.user_id
 OR NEW.request_id != OLD.request_id OR NEW.idempotency_key != OLD.idempotency_key
 OR NEW.input_json != OLD.input_json OR NEW.plan_json != OLD.plan_json OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT, 'handoff plan is immutable'); END;
CREATE TRIGGER orchestrator_handoff_completed_immutable
BEFORE UPDATE ON orchestrator_handoffs WHEN OLD.status = 'dispatched'
BEGIN SELECT RAISE(ABORT, 'completed handoff is immutable'); END;
