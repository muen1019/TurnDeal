import assert from 'node:assert/strict';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRuntimeApp } from '../backend/runtime/app.mjs';
import { buyerMessage,sellerMessage } from '../src/negotiation/tradeoffs.mjs';
import { economicallyValid } from '../src/negotiation/economics.mjs';
const live=process.argv.includes('--live'),afterSales=process.argv.includes('--after-sales');
if(live && existsSync('.env'))loadEnvFile('.env');
const key=live?(process.env.API_KEY||process.env.OPENAI_API_KEY||''):'';
assert.ok(!live||key.trim(),'API_KEY is required for live E2E');
const started=new Date(),name=`${live?'live':'offline'}-${afterSales?'service':'price'}-${started.toISOString().replace(/[:.]/g,'-')}`;
const dir=new URL(`../reports/catalog-e2e/${name}/`,import.meta.url);mkdirSync(dir,{recursive:true});
const dbPath=fileURLToPath(new URL(`../data/catalog-e2e-${name}.sqlite`,import.meta.url));
const app=createRuntimeApp({apiKey:key,dbPath,autoProcess:false,buyerId:()=> 'catalog_e2e'}),store=app.locals.store;
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,checks=[];
const verify=(label,work)=>{try{work();checks.push({label,passed:true});}catch(e){checks.push({label,passed:false,detail:e.message});}};
let failure;
try {
  const documents={intent_md:'買一個無線滑鼠，預算1500元含稅運，7天內到貨。',preference_md:`${afterSales?'售後':'價格'}優先，可接受免費滑鼠墊，不接受付費加購。`};
  const response=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':name},body:JSON.stringify(documents)});
  assert.equal(response.status,202);const initial=await response.json();
  console.log(`Request ${initial.request_id}: ${live?'real models':'offline'} / ${afterSales?'after-sales':'price'}`);
  await store.process(initial.request_id,'catalog_e2e');
  const result=await (await fetch(base+`/api/requests/${initial.request_id}`)).json();
  verify('HTTP 完整流程達到待選方案',()=>assert.equal(result.status,'awaiting_user',JSON.stringify(result.error)));
  verify('自然選出五個賣家與五個可選方案',()=>{
    assert.equal(result.seller_agents.length,5);
    assert.equal(new Set(result.ranked_offers.map(r=>result.offers.find(o=>o.offer_id===r.offer_id).seller_id)).size,5);
    assert.ok(result.seller_agents.some(s=>s.seller_id.startsWith('discovery_seller_')));
  });
  const catalog=store.repository.catalog(result.seller_agents.map(s=>s.seller_id));
  verify('全部正式報價遵守底價、成本、贈品與權益預算',()=>{
    assert.ok(result.offers.length);
    for(const o of result.offers){
      const seller=catalog.sellers.find(s=>s.seller_id===o.seller_id),p=seller.products.find(p=>p.product_id===o.items[0].product_id);
      assert.ok(o.total_price_twd>=p.floor_price_twd);
      assert.ok(economicallyValid(seller,p,o.total_price_twd,o.benefits??[],o.items.find(i=>i.role==='addon')?.product_id??null));
    }
  });
  verify('排名只包含完整且合格的 Offer 集合',()=>{
    assert.deepEqual(result.ranked_offers.map(r=>r.offer_id).sort(),result.offers.filter(o=>o.eligibility.status==='eligible').map(o=>o.offer_id).sort());
  });
  verify('回應沒有私有政策、成本或底價',()=>{
    for(const field of ['unit_cost_twd','floor_price_twd','inventory_pressure','policy_json','private_policy'])assert.ok(!JSON.stringify(result).includes(field));
  });
  const history=store.repository.history(initial.request_id,'catalog_e2e'),traces=history.at(-1)?.traces??[];
  const evaluationRow=store.db.prepare('SELECT result_json FROM evaluation_runs WHERE request_id=?').get(initial.request_id);
  const evaluation=evaluationRow?JSON.parse(evaluationRow.result_json):null;
  const frozen=JSON.stringify(result);
  const runsBefore=store.db.prepare('SELECT count(*) AS n FROM negotiation_runs').get().n;
  await store.process(initial.request_id,'catalog_e2e');
  const repeated=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':name},body:JSON.stringify(documents)});
  const replay=await repeated.json();
  verify('重送請求與流程重播不新增協商或改寫 Offer',()=>{
    assert.equal(replay.request_id,initial.request_id);
    assert.equal(JSON.stringify(store.snapshot(initial.request_id,'catalog_e2e')),frozen);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM negotiation_runs').get().n,runsBefore);
  });
  const rounds=traces.map(t=>({seller_id:t.seller_id,round:t.round,buyer_provider:t.buyer_provider,seller_provider:t.seller_provider,
    buyer:t.rfq?buyerMessage(t.rfq.proposal):'買家停止協商',seller:t.result?sellerMessage(t.result):'',
    seller_model_message:t.result?.message,quotes:t.result?.drafts??[],fallbacks:t.audit?.filter(a=>a.status==='fallback')??[]}));
  const ranked=result.ranked_offers.map(r=>({...r,...result.offers.find(o=>o.offer_id===r.offer_id),
    persona:catalog.sellers.find(s=>s.seller_id===result.offers.find(o=>o.offer_id===r.offer_id).seller_id).strategy.persona.persona}));
  const report={mode:live?'live':'offline',documents,started_at:started.toISOString(),duration_seconds:(Date.now()-started.getTime())/1000,
    coverage:{sellers:store.db.prepare('SELECT count(*) AS n FROM sellers').get().n,
      sku_policies:store.db.prepare('SELECT count(*) AS n FROM seller_sku_policies').get().n,
      discovery_listings:store.db.prepare('SELECT count(*) AS n FROM seller_listing_bindings').get().n},checks,formatter:store.db.prepare('SELECT result_json FROM formatter_runs WHERE request_id=?').get(initial.request_id),
    evaluator:{provider:evaluation?.provider,fallback_reason:evaluation?.fallback_reason,usage:evaluation?.usage},ranked,rounds};
  writeFileSync(new URL('report.json',dir),JSON.stringify(report,null,2)+'\n');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>完整 Catalog 協商測試</title><style>body{font-family:system-ui;max-width:1100px;margin:40px auto;padding:0 20px;background:#f6f8fa;color:#17212e}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}details{background:white;padding:18px;margin:15px 0;border-radius:10px}p{line-height:1.7}.pass{color:#17613a}small{color:#596579}</style><h1>完整 Catalog 協商測試</h1><p>${esc(report.mode)} · ${report.duration_seconds.toFixed(2)} 秒 · ${afterSales?'售後':'價格'}優先<br>20 家賣家 / 129 個 SKU 政策；商務資料與履約證據均為模擬。按公開條件自然排序，不強制每種 Persona 各入選一家。</p><p>${esc(documents.intent_md)} ${esc(documents.preference_md)}</p><h2>驗證</h2>${checks.map(c=>`<p class="${c.passed?'pass':''}">${c.passed?'✓':'✗'} ${esc(c.label)}</p>`).join('')}<h2>最終排名</h2><table><tr><th>名次</th><th>賣家 / Persona</th><th>總價 / 交期</th><th>實際權益</th></tr>${ranked.map((o,i)=>`<tr><td>${i+1}</td><td>${esc(o.seller_id)}<br><small>${esc(o.persona)}</small></td><td>NT$${o.total_price_twd}<br>${o.delivery_days} 天 · ${esc(o.variant)}</td><td>${esc((o.benefits??[]).map(b=>b.description).join('、')||'無額外權益')}</td></tr>`).join('')}</table><h2>逐輪協商對話</h2><p>買賣方條件對話由實際結構化提案重建；另列出 Seller 原始回覆。provider 顯示真實模型或 fallback。</p>${result.seller_agents.map(s=>`<details open><summary>${esc(s.seller_id)} · ${s.rounds.length} 輪</summary>${rounds.filter(t=>t.seller_id===s.seller_id).map(t=>`<h3>第 ${t.round} 輪 <small>${esc(t.buyer_provider)} / ${esc(t.seller_provider)}</small></h3><p><b>Buyer：</b>${esc(t.buyer)}</p><p><b>Seller：</b>${esc(t.seller)}</p><p><small>模型／fallback 原始回覆：${esc(t.seller_model_message)}</small></p>`).join('')}</details>`).join('')}<p>Evaluator：${esc(evaluation?.provider)} ${esc(evaluation?.fallback_reason)}</p><a href="report.json">結構化測試結果</a></html>`;
  writeFileSync(new URL('report.html',dir),html);
  console.log(JSON.stringify({report:fileURLToPath(new URL('report.html',dir)),checks:checks.filter(c=>c.passed).length,total:checks.length,
    evaluator:report.evaluator,ranked:ranked.map(o=>({seller:o.seller_id,persona:o.persona,price:o.total_price_twd})),fallbacks:rounds.flatMap(t=>t.fallbacks).length},null,2));
  if(checks.some(c=>!c.passed))failure=new Error('Catalog E2E checks failed');
}finally{await new Promise(resolve=>server.close(resolve));await store.close();}
if(failure)throw failure;
