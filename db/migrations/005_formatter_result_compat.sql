-- Result's requests table rebuild may run after 004 on an existing Formatter DB.
-- Restore its immutability guard without modifying saved requests or results.
DROP TRIGGER IF EXISTS formatted_request_immutable;
CREATE TRIGGER formatted_request_immutable BEFORE UPDATE ON requests
WHEN EXISTS (SELECT 1 FROM formatter_runs WHERE request_id=OLD.request_id)
 AND (NEW.user_id != OLD.user_id OR NEW.intent_md != OLD.intent_md OR NEW.preference_md != OLD.preference_md
   OR NEW.normalized_intent_json != OLD.normalized_intent_json OR NEW.revision != OLD.revision)
BEGIN SELECT RAISE(ABORT, 'formatted request is immutable; create a new request'); END;
