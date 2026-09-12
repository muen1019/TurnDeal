-- Internal Improver storage. Existing Result decisions and published snapshots stay unchanged.
CREATE TABLE improver_global_preferences (
  buyer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(buyer_id, revision)
) STRICT;

CREATE TABLE improver_jobs (
  improvement_id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  parent_request_id TEXT NOT NULL UNIQUE REFERENCES requests(request_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','ready','needs_clarification','failed')),
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
  claims INTEGER NOT NULL DEFAULT 0 CHECK(claims BETWEEN 0 AND 2),
  lease_token TEXT,
  lease_until INTEGER,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE improver_intent_revisions (
  intent_revision_id TEXT PRIMARY KEY,
  improvement_id TEXT NOT NULL UNIQUE REFERENCES improver_jobs(improvement_id) ON DELETE RESTRICT,
  parent_request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE RESTRICT,
  document_revision INTEGER NOT NULL CHECK(document_revision >= 2),
  state TEXT NOT NULL CHECK(state IN ('ready','draft')),
  intent_md TEXT NOT NULL,
  preference_revision INTEGER NOT NULL CHECK(preference_revision >= 0),
  preference_md TEXT NOT NULL,
  audit_json TEXT NOT NULL CHECK(json_valid(audit_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER improver_global_revision_immutable BEFORE UPDATE ON improver_global_preferences
BEGIN SELECT RAISE(ABORT,'global preference revisions are immutable'); END;
CREATE TRIGGER improver_intent_revision_immutable BEFORE UPDATE ON improver_intent_revisions
BEGIN SELECT RAISE(ABORT,'intent revisions are immutable'); END;
CREATE TRIGGER improver_context_immutable BEFORE UPDATE OF context_json ON improver_jobs
BEGIN SELECT RAISE(ABORT,'improvement context is immutable'); END;
CREATE TRIGGER improver_terminal_immutable BEFORE UPDATE ON improver_jobs
WHEN OLD.status IN ('ready','needs_clarification','failed')
BEGIN SELECT RAISE(ABORT,'improvement results are immutable'); END;
