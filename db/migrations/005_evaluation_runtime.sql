CREATE TABLE evaluation_runs (
  request_id TEXT PRIMARY KEY REFERENCES negotiation_runs(request_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  input_json TEXT CHECK (input_json IS NULL OR json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK ((status = 'running' AND result_json IS NULL AND completed_at IS NULL)
    OR (status <> 'running' AND result_json IS NOT NULL AND completed_at IS NOT NULL))
) STRICT;
CREATE TRIGGER evaluation_run_final_immutable BEFORE UPDATE ON evaluation_runs
WHEN OLD.status <> 'running' BEGIN SELECT RAISE(ABORT, 'completed evaluations are immutable'); END;
CREATE TRIGGER evaluation_run_input_immutable BEFORE UPDATE OF request_id, input_json, started_at ON evaluation_runs
BEGIN SELECT RAISE(ABORT, 'evaluation input is immutable'); END;
