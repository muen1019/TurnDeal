-- One versioned user preference document. Keep the existing table name for history.
ALTER TABLE improver_global_preferences ADD COLUMN product_preferences_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(product_preferences_json));
ALTER TABLE improver_global_preferences ADD COLUMN issues_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(issues_json));

-- Import active legacy structured preferences once. Preserve both sources and flag
-- overlapping documents for explicit review instead of choosing a silent winner.
INSERT INTO improver_global_preferences(buyer_id,revision,markdown,created_at,product_preferences_json,issues_json)
SELECT p.user_id, COALESCE(g.revision,0)+1, COALESCE(g.markdown,''), datetime('now'),
  json_group_array(json_object('preference_id',p.preference_id,'attribute',p.attribute,
    'operator',p.operator,'values_json',p.values_json,'strength',p.strength)),
  CASE WHEN length(trim(COALESCE(g.markdown,'')))>0 THEN '["legacy_preference_sources_require_review"]' ELSE '[]' END
FROM user_preferences p LEFT JOIN improver_global_preferences g ON g.buyer_id=p.user_id
  AND g.revision=(SELECT MAX(v.revision) FROM improver_global_preferences v WHERE v.buyer_id=p.user_id)
WHERE p.active=1 GROUP BY p.user_id;

-- Request bindings are immutable snapshots of a user version, not editable profiles.
CREATE TABLE request_preference_bindings (
  request_id TEXT PRIMARY KEY REFERENCES requests(request_id) ON DELETE RESTRICT,
  buyer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  preference_json TEXT NOT NULL CHECK(json_valid(preference_json))
) STRICT;
CREATE TRIGGER request_preference_binding_immutable BEFORE UPDATE ON request_preference_bindings
BEGIN SELECT RAISE(ABORT,'request preference bindings are immutable'); END;
