import { DatabaseSync } from 'node:sqlite';
import { createOrchestratorDataTools } from '../src/orchestrator/data-tools.ts';

const db = new DatabaseSync(new URL('../data/offermesh.sqlite', import.meta.url), { readOnly: true });
try {
  const tools = createOrchestratorDataTools({
    db, userId: 'user_demo_001', demoTrustUserId: 'user_demo_001',
    // Example registry only. Real Backend must supply IDs from registered negotiation handlers.
    registeredSellerIds: ['seller_a', 'seller_b', 'seller_c'],
  });
  console.log(JSON.stringify(tools.load_discovery_input({
    request_id: 'req_demo_001', now: '2026-09-12T10:00:00+08:00',
  }), null, 2));
} finally { db.close(); }
