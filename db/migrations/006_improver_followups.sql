-- Preserve original jobs/results; allow an immutable successor after explicit clarification.
CREATE TABLE improver_jobs_next (
  improvement_id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  parent_request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','ready','needs_clarification','failed')),
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
  claims INTEGER NOT NULL DEFAULT 0 CHECK(claims BETWEEN 0 AND 2),
  lease_token TEXT, lease_until INTEGER,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  source_improvement_id TEXT UNIQUE REFERENCES improver_jobs(improvement_id) ON DELETE RESTRICT
) STRICT;
INSERT INTO improver_jobs_next SELECT *,NULL FROM improver_jobs;
DROP TABLE improver_jobs;
ALTER TABLE improver_jobs_next RENAME TO improver_jobs;
CREATE UNIQUE INDEX improver_initial_per_parent ON improver_jobs(parent_request_id) WHERE source_improvement_id IS NULL;
CREATE TRIGGER improver_context_immutable BEFORE UPDATE OF context_json,source_improvement_id ON improver_jobs
BEGIN SELECT RAISE(ABORT,'improvement context is immutable'); END;
CREATE TRIGGER improver_terminal_immutable BEFORE UPDATE ON improver_jobs
WHEN OLD.status IN ('ready','needs_clarification','failed')
BEGIN SELECT RAISE(ABORT,'improvement results are immutable'); END;

-- Only newly authorized workflows opt in. Historical decisions/jobs are not backfilled.
CREATE TABLE improver_workflows (
  parent_request_id TEXT PRIMARY KEY REFERENCES requests(request_id) ON DELETE RESTRICT,
  buyer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  initial_improvement_id TEXT NOT NULL UNIQUE REFERENCES improver_jobs(improvement_id) ON DELETE RESTRICT,
  current_improvement_id TEXT NOT NULL UNIQUE REFERENCES improver_jobs(improvement_id) ON DELETE RESTRICT,
  next_request_id TEXT UNIQUE REFERENCES requests(request_id) ON DELETE RESTRICT,
  formatter_json TEXT CHECK(formatter_json IS NULL OR json_valid(formatter_json)),
  error TEXT,
  created_at TEXT NOT NULL,
  CHECK((next_request_id IS NULL AND formatter_json IS NULL) OR (next_request_id IS NOT NULL AND formatter_json IS NOT NULL))
) STRICT;
CREATE TRIGGER improver_child_link_immutable BEFORE UPDATE ON improver_workflows
WHEN OLD.next_request_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'improvement child link is immutable'); END;
