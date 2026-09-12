import { DatabaseSync } from 'node:sqlite';
import { createDiscoveryService } from '../src/orchestrator/discovery.ts';
const db = new DatabaseSync(new URL('../data/offermesh.sqlite', import.meta.url));
try {
  db.exec('PRAGMA foreign_keys=ON');
  const service = createDiscoveryService({ db, userId: 'user_demo_001', registeredSellerIds: [] });
  const result = service.discover_candidates({ query: { category: 'mouse', target_total_twd: 800 },
    snapshot_id: 'discovery_demo_v02', now: '2026-09-12T10:00:00+08:00' });
  console.table(result.candidates.map(c => ({ rank: c.rank, seller: c.seller.name, product: c.listing.name,
    total: c.total_price_twd, score: c.score, status: c.candidate_status })));
  console.log('Saved run:', result.run_id);
} finally { db.close(); }
