import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const demoFixture = JSON.parse(readFileSync(new URL('../../contracts/fixtures/happy-path.json', import.meta.url), 'utf8'));

// Development/demo adapter for the not-yet-implemented Request/Orchestrator pipeline.
export function prepareDemoRequest(db, { requestId = `req_${randomUUID()}`, intent = demoFixture.request.normalized_intent,
  buyerId = 'user_demo_001', now = new Date().toISOString() } = {}) {
  const docs = demoFixture.request.documents;
  db.prepare(`INSERT INTO requests (request_id, user_id, revision, intent_md, preference_md,
    normalized_intent_json, status, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, 'orchestrating', ?, ?)`)
    .run(requestId, buyerId, docs.intent_md, docs.preference_md, JSON.stringify(intent), now, now);
  const orchestration = structuredClone(demoFixture.orchestration);
  for (const branch of orchestration.seller_agents) {
    branch.status = 'pending'; branch.rounds = []; branch.final_offer_ids = []; branch.stop_reason = null;
  }
  return { requestId, buyerId, orchestration };
}
