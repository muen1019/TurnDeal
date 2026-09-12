-- Preserve legacy published data; add a separate recoverable Result state.
DROP TRIGGER published_snapshots_are_immutable;
CREATE TABLE requests_v03 (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  parent_request_id TEXT REFERENCES requests(request_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  intent_md TEXT NOT NULL,
  preference_md TEXT NOT NULL DEFAULT '',
  normalized_intent_json TEXT NOT NULL CHECK (json_valid(normalized_intent_json)),
  status TEXT NOT NULL CHECK (status IN ('formatting', 'orchestrating', 'negotiating', 'evaluating', 'awaiting_user', 'needs_clarification', 'needs_confirmation', 'no_match', 'failed', 'accepted', 'rejected', 'superseded', 'redeemed')),
  published_snapshot_json TEXT CHECK (published_snapshot_json IS NULL OR json_valid(published_snapshot_json)),
  result_state_json TEXT CHECK (result_state_json IS NULL OR json_valid(result_state_json)),
  contract_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (parent_request_id, revision)
) STRICT;

INSERT INTO requests_v03 (request_id,user_id,parent_request_id,revision,intent_md,preference_md,normalized_intent_json,status,published_snapshot_json,created_at,updated_at) SELECT request_id,user_id,parent_request_id,revision,intent_md,preference_md,normalized_intent_json,status,published_snapshot_json,created_at,updated_at FROM requests;
DROP TABLE requests;
ALTER TABLE requests_v03 RENAME TO requests;
CREATE INDEX idx_requests_user_created ON requests(user_id, created_at DESC);
CREATE INDEX idx_requests_parent ON requests(parent_request_id);
CREATE TRIGGER published_snapshots_are_immutable
BEFORE UPDATE OF published_snapshot_json ON requests
WHEN OLD.published_snapshot_json IS NOT NULL AND NEW.published_snapshot_json IS NOT OLD.published_snapshot_json
BEGIN SELECT RAISE(ABORT, 'published request snapshots are immutable'); END;
ALTER TABLE decisions ADD COLUMN result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json));
CREATE UNIQUE INDEX one_result_decision_per_request ON decisions(request_id) WHERE result_json IS NOT NULL;
CREATE TRIGGER result_decisions_are_immutable BEFORE UPDATE OF result_json ON decisions
WHEN OLD.result_json IS NOT NULL AND NEW.result_json IS NOT OLD.result_json
BEGIN SELECT RAISE(ABORT, 'saved decisions are immutable'); END;
