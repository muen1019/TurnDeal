import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { createFormatterService } from '../src/formatter/service.ts';
import type { SellerHandler } from '../src/orchestrator/handoff.ts';
const db=new DatabaseSync(':memory:');
try {
  initializeDatabase(db);const catalog=seedDiscovery(db);
  const handler:SellerHandler=async rfq=>({request_id:rfq.request_id,seller_id:rfq.seller_id,round:1,
    outcome:'refused',is_final:false,drafts:[],message:'Demo 替身；正式議價策略待接入'});
  const service=createFormatterService({db,userId:'user_demo_001',timeoutMs:1000,
    now:()=>new Date('2026-09-12T02:00:00Z'),
    registrations:catalog.sellers.map(s=>({seller_id:s.seller_id,snapshot_id:catalog.snapshot_id,handle:handler}))});
  const prompt=process.argv[2]??'想買800元左右的無線靜音滑鼠，最高1000元，7天內到貨，只接受黑色，偏好小尺寸、左右對稱，價格優先';
  const r=service.prepare_from_text({intent_md:prompt,idempotency_key:'demo-text',snapshot_id:catalog.snapshot_id});
  console.log('使用者文字：',prompt);console.log('Formatter：',JSON.stringify(r.result,null,2));
  if(r.handoff) {
    console.table(r.handoff.discovery.candidates.map(c=>({rank:c.rank,seller:c.seller.name,product:c.listing.name,total:c.total_price_twd,score:c.score})));
    console.table(await service.dispatch_first_round({handoff_id:r.handoff.handoff_id}));
  } else console.log('等待補充，沒有呼叫 Seller。');
} finally {db.close();}
