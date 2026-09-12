ALTER TABLE evaluation_runs ADD COLUMN audit_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(audit_json));
