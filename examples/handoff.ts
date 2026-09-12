import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { createOrchestratorHandoff } from '../src/orchestrator/handoff.ts';
import type { SellerHandler } from '../src/orchestrator/handoff.ts';

// Entire demo is in memory: no destructive rebuild and no production policy is enabled.
const db = new DatabaseSync(':memory:');
try {
  initializeDatabase(db);
  const catalog = seedDiscovery(db);
  const demoHandler: SellerHandler = async rfq => ({
    request_id:rfq.request_id,seller_id:rfq.seller_id,round:rfq.round,
    outcome:'refused',is_final:false,drafts:[],message:'Demo 接線替身：正式議價策略尚待接入。',
  });
  const service = createOrchestratorHandoff({ db,userId:'user_demo_001',timeoutMs:1000,
    now:()=>new Date('2026-09-12T02:00:00Z'),
    registrations:catalog.sellers.map(s=>({seller_id:s.seller_id,snapshot_id:catalog.snapshot_id,handle:demoHandler})),
  });
  const plan = service.prepare({request_id:'req_demo_001',snapshot_id:catalog.snapshot_id,
    idempotency_key:'handoff-demo',target_total_twd:800});
  console.table(plan.product_bindings);
  console.log('RFQ example (no private budget/source text):',plan.rfqs[0]);
  console.table(await service.dispatch_first_round({handoff_id:plan.handoff_id}));
  console.log('接線成功；以上為替身回應，不是真實報價，也沒有產生正式 Offer。');
} finally {db.close();}
