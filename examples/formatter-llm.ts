import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../scripts/db.mjs';
import { seedDiscovery } from '../scripts/discovery-db.mjs';
import { createLlmFormatterService } from '../src/formatter/llm-service.ts';
import type { SellerHandler } from '../src/orchestrator/handoff.ts';
import { FormatterLlmError } from '../src/formatter/diagnostics.ts';

// Real LLM request; SQLite and Seller handlers remain isolated demo fixtures.
if(!process.env.OPENAI_API_KEY) {
  console.error('尚未設定 OPENAI_API_KEY。請執行 npm run demo:formatter:secure，隱藏輸入新 key。');
  process.exitCode=1;
} else {
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);const catalog=seedDiscovery(db);
    const handle:SellerHandler=async rfq=>({request_id:rfq.request_id,seller_id:rfq.seller_id,round:1,outcome:'refused',is_final:false,drafts:[],message:'Seller demo stub'});
    const service=createLlmFormatterService({db,userId:'user_demo_001',timeoutMs:1000,
      registrations:catalog.sellers.map(s=>({seller_id:s.seller_id,snapshot_id:catalog.snapshot_id,handle}))},
      {failureMode:'throw'});
    const input=process.argv[2]??'想找一隻安靜的黑色無線滑鼠，大約八百元，含運最多一千元，七天內收到就好，尺寸小一點優先。';
    const result=await service.prepare_from_text({intent_md:input,idempotency_key:'live-demo',snapshot_id:catalog.snapshot_id});
    if(result.result.parser_version!=='formatter-llm-v0.1')throw new Error('live_demo_requires_llm');
    console.log('LLM_API_SUCCESS: OpenAI 回應已通過 schema 與本地驗證。');
    console.log(JSON.stringify(result.result,null,2));
    if(result.handoff)console.table(result.handoff.discovery.candidates.map(c=>({seller:c.seller.name,product:c.listing.name,total:c.total_price_twd,score:c.score})));
    console.log('未啟動議價或購買。');
  } catch(error) {
    if(error instanceof FormatterLlmError)console.error('LLM_DIAGNOSTIC',JSON.stringify(error.diagnostic,null,2));
    else console.error('Formatter 本地整合失敗（非 API fallback），請執行 npm test；未輸出原始例外。');
    console.error('LLM_API_FAILED: 本次沒有當成成功，也沒有呼叫 Seller。');process.exitCode=1;
  }
  finally {db.close();}
}
