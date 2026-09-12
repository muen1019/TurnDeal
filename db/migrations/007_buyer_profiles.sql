CREATE TABLE buyer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id),
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  updated_at TEXT NOT NULL
);
ALTER TABLE requests ADD COLUMN ranking_weights_json TEXT CHECK(ranking_weights_json IS NULL OR json_valid(ranking_weights_json));
