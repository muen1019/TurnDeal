-- User profile controls are part of the one versioned preference document.
ALTER TABLE improver_global_preferences ADD COLUMN ranking_weights_json TEXT CHECK(ranking_weights_json IS NULL OR json_valid(ranking_weights_json));
INSERT INTO improver_global_preferences(buyer_id,revision,markdown,created_at,product_preferences_json,issues_json,ranking_weights_json)
SELECT b.user_id,coalesce(p.revision,0)+1,coalesce(p.markdown,'') || CASE WHEN json_array_length(json_extract(b.profile_json,'$.colors'))>0 AND coalesce(p.markdown,'')='' THEN
char(10)||'<!-- offermesh-preference:buyer_profile_color scope=category:mouse -->'||char(10)||'偏好'||
(SELECT group_concat(CASE value WHEN 'black' THEN '黑色' WHEN 'white' THEN '白色' WHEN 'blue' THEN '藍色' WHEN 'red' THEN '紅色' WHEN 'rose' THEN '粉色' END,'或') FROM json_each(b.profile_json,'$.colors'))||char(10)||'<!-- /offermesh-preference -->'||char(10) ELSE '' END,
b.updated_at,coalesce(p.product_preferences_json,'[]'),
CASE WHEN json_array_length(json_extract(b.profile_json,'$.colors'))>0 AND coalesce(p.markdown,'')<>'' THEN json_insert(coalesce(p.issues_json,'[]'),'$[#]','legacy_preference_sources_require_review') ELSE coalesce(p.issues_json,'[]') END,
json_extract(b.profile_json,'$.weights')
FROM buyer_profiles b LEFT JOIN improver_global_preferences p ON p.buyer_id=b.user_id AND p.revision=(SELECT max(revision) FROM improver_global_preferences WHERE buyer_id=b.user_id)
WHERE json_type(b.profile_json,'$.weights')='object';
UPDATE buyer_profiles SET profile_json=json_remove(profile_json,'$.colors','$.weights');
