import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { createOrchestratorDataTools } from '../src/orchestrator/data-tools.ts';

test('Orchestrator input resolves seeded data without Seller private policy', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);
    const tools = createOrchestratorDataTools({ db, userId: 'user_demo_001',
      demoTrustUserId: 'user_demo_001', registeredSellerIds: ['seller_a', 'seller_b'] });
    const input = tools.load_discovery_input({ request_id: 'req_demo_001', now: '2026-09-12T02:00:00Z' });
    assert.equal(input.catalog.length, 6);
    assert.equal(input.sellers.length, 3);
    assert.equal(input.sellers.find(s => s.seller_id === 'seller_c')?.handler_registered, false);
    assert.equal(input.catalog.find(p => p.product_id === 'mouse_b_rose_small')?.stock, 0);
    assert.equal(tools.list_catalog({ category: 'mouse_pad' }).length, 1);
    assert.equal(tools.list_catalog({ category: 'mouse', seller_id: 'seller_a' }).length, 2);
    assert.equal(input.campaigns.length, 1);
    assert.equal(input.seller_trust[0].trust.personal_band, 'positive');
    const serialized = JSON.stringify(input);
    assert.ok(!serialized.includes('floor_price_twd'));
    assert.ok(!serialized.includes('round_1_discount_twd'));
    assert.deepEqual(tools.get_request_preferences({ request_id: 'req_demo_001' }).product_preferences,
      input.request.normalized_intent?.product_preferences);
    // Mutating returned values cannot alter the persisted request or future reads.
    input.catalog[0].features.push('fake_feature');
    assert.ok(!tools.list_catalog({ category: 'mouse' })[0].features.includes('fake_feature'));
    assert.equal(tools.list_active_campaigns({ category: 'mouse', now: '2026-09-12T10:00:00Z' }).length, 0);
    assert.throws(() => tools.list_active_campaigns({ category: 'mouse', now: 'invalid' }), { code: 'invalid_argument' });
  } finally { db.close(); }
});

test('Request ownership, unpublished intent and long-term preference changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);
    const other = createOrchestratorDataTools({ db, userId: 'another_user',
      demoTrustUserId: 'user_demo_001', registeredSellerIds: [] });
    assert.throws(() => other.get_request_context({ request_id: 'req_demo_001' }), { code: 'not_found' });
    assert.equal(other.get_seller_trust({ seller_id: 'seller_a' }).trust.personal_rating, null);
    assert.throws(() => other.get_request_context({ request_id: "x' OR 1=1" }), { code: 'invalid_argument' });
    const tools = createOrchestratorDataTools({ db, userId: 'user_demo_001', registeredSellerIds: [] });
    const before = tools.get_request_preferences({ request_id: 'req_demo_001' });
    db.exec(`INSERT INTO user_preferences VALUES ('pref_new', 'user_demo_001', 'color', 'in', '["red"]',
      'preferred', 1, NULL, 1, '2026-09-12T11:00:00Z', '2026-09-12T11:00:00Z')`);
    assert.deepEqual(tools.get_request_preferences({ request_id: 'req_demo_001' }), before);
    db.exec(`INSERT INTO requests VALUES ('req_pending', 'user_demo_001', NULL, 1, 'mouse', '', 'null',
      'formatting', NULL, '2026-09-12T11:00:00Z', '2026-09-12T11:00:00Z')`);
    assert.throws(() => tools.load_discovery_input({ request_id: 'req_pending', now: '2026-09-12T11:00:00Z' }),
      { code: 'intent_not_ready' });
    // Error path releases its read transaction.
    assert.equal(tools.load_discovery_input({ request_id: 'req_demo_001', now: '2026-09-12T02:00:00Z' }).catalog.length, 6);
  } finally { db.close(); }
});
