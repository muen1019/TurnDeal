-- Request-owned runtime snapshots are separate from the legacy demo seed trace.
-- Each barrier commits its entire history and shared context in one short write.
CREATE TABLE negotiation_runs (
  request_id TEXT PRIMARY KEY REFERENCES requests(request_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  options_json TEXT NOT NULL CHECK (json_valid(options_json)),
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  final_json TEXT CHECK (final_json IS NULL OR json_valid(final_json)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK ((status = 'running' AND final_json IS NULL AND completed_at IS NULL)
    OR (status <> 'running' AND final_json IS NOT NULL AND completed_at IS NOT NULL))
) STRICT;

CREATE TABLE negotiation_commits (
  request_id TEXT NOT NULL REFERENCES negotiation_runs(request_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 0 AND 5),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  committed_at TEXT NOT NULL,
  PRIMARY KEY (request_id, revision)
) STRICT, WITHOUT ROWID;

CREATE TRIGGER negotiation_commits_immutable
BEFORE UPDATE ON negotiation_commits
BEGIN
  SELECT RAISE(ABORT, 'negotiation commits are immutable');
END;

CREATE TABLE negotiation_offers (
  offer_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES negotiation_runs(request_id) ON DELETE RESTRICT,
  offer_json TEXT NOT NULL CHECK (json_valid(offer_json)),
  created_at TEXT NOT NULL,
  CHECK (json_extract(offer_json, '$.offer_id') = offer_id)
) STRICT;

CREATE TRIGGER negotiation_offers_immutable
BEFORE UPDATE ON negotiation_offers
BEGIN
  SELECT RAISE(ABORT, 'negotiation offers are immutable');
END;

CREATE TRIGGER negotiation_run_final_immutable
BEFORE UPDATE ON negotiation_runs
WHEN OLD.status <> 'running'
BEGIN
  SELECT RAISE(ABORT, 'completed negotiation runs are immutable');
END;

CREATE TRIGGER negotiation_input_immutable
BEFORE UPDATE OF options_json, input_json, request_id, started_at ON negotiation_runs
BEGIN
  SELECT RAISE(ABORT, 'negotiation inputs are immutable');
END;
