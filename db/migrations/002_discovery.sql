CREATE TABLE IF NOT EXISTS discovery_catalogs (
  snapshot_id TEXT PRIMARY KEY,
  source_snapshot_id TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS discovery_runs (
  run_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  snapshot_id TEXT NOT NULL REFERENCES discovery_catalogs(snapshot_id),
  policy_version TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS discovery_catalog_immutable
BEFORE UPDATE ON discovery_catalogs BEGIN SELECT RAISE(ABORT, 'catalog snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS discovery_run_immutable
BEFORE UPDATE ON discovery_runs BEGIN SELECT RAISE(ABORT, 'discovery runs are immutable'); END;
