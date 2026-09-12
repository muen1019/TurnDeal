import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './db.mjs';
import { prepareDemoRequest } from './lib/negotiation-demo.mjs';
import { prepareHandoffE2E } from './lib/handoff-e2e.mjs';
import { evaluate } from '../src/evaluator/index.mjs';
import { validateRanking } from '../src/evaluator/ranking.mjs';
import { applySalesProfiles, salesProfiles } from './lib/sales-profiles.mjs';
import { reportHtml, reportMarkdown, fallbackSummary } from './lib/e2e-report.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { check } from '../src/negotiation/contracts.mjs';
import { validateSellerList } from './lib/contract-validation.mjs';

const args = process.argv.slice(2);
assert.ok(args.length >= 1 && args.length <= 2 && ['--live', '--offline'].includes(args[0]) && (!args[1] || args[1] === '--evaluate'), 'Specify --live or --offline and optionally --evaluate');
const live = args[0] === '--live';
const full = args.includes('--evaluate');
const env = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(env)) loadEnvFile(env);
const apiKey = live ? process.env.API_KEY ?? '' : '';
assert.ok(!live || apiKey.trim(), 'Set API_KEY in .env');
const model = process.env.NEGOTIATION_MODEL || 'gpt-4.1-mini-2025-04-14';
const startedAt = new Date().toISOString();
const runName = `${live ? 'live' : 'offline'}-${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const dataDir = new URL('../data/', import.meta.url);
const reportDir = new URL(`../reports/${full ? 'full-e2e' : 'negotiation-e2e'}/${runName}/`, import.meta.url);
mkdirSync(dataDir, { recursive: true }); mkdirSync(reportDir, { recursive: true });
const dbPath = fileURLToPath(new URL(`e2e-${runName}.sqlite`, dataDir));
let db = new DatabaseSync(dbPath);
const checks = [];
function verify(name, work) {
  try { work(); checks.push({ name, passed: true }); }
  catch { checks.push({ name, passed: false, detail: 'Assertion failed; see sanitized result and round history.' }); }
}
try {
  initializeDatabase(db); applySalesProfiles(db);
  const start = performance.now();
  const input = full ? prepareHandoffE2E(db) : prepareDemoRequest(db);
  if (full) verify('遠端 handoff.prepare 實際選出五家，計畫與 Discovery 已保存並可重播', () => {
    assert.equal(input.plan.discovery.returned_count, 5);
    assert.equal(input.plan.rfqs.length, 5);
    assert.deepEqual(input.replayPlan(), input.plan);
    assert.equal(db.prepare('SELECT count(*) AS n FROM discovery_runs').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM orchestrator_handoffs').get().n, 1);
  });
  let repository = new NegotiationRepository(db);
  const catalog = repository.catalog(input.orchestration.seller_agents.map(s => s.seller_id));
  const intent = repository.request(input.requestId, input.buyerId).intent;
  const result = await negotiate({ ...input, repository, apiKey, model, onEvent(event) {
    if (event.type === 'round_started') console.log(`Round ${event.round}: ${event.seller_ids.length} active sellers`);
    if (event.type === 'seller_round_completed') console.log(`  ${event.seller_id}: ${event.offers.map(o => `${o.variant} ${o.total_price_twd}`).join(' / ')} [${event.buyer_provider}/${event.seller_provider}]`);
  } });
  const negotiationDuration = Number(((performance.now() - start) / 1000).toFixed(2));
  const history = repository.history(input.requestId, input.buyerId);
  const traces = history.at(-1).traces;
  verify('輸出契約與五家分支狀態正確', () => { check('NegotiationOutput', result); validateSellerList(result.seller_agents); assert.equal(result.seller_agents.length, 5); });
  verify('五家皆提供可履約方案，交給 Evaluator', () => { assert.equal(result.status, 'evaluating'); assert.equal(new Set(result.offers.map(o => o.seller_id)).size, 5); assert.equal(result.offers.length, 7); });
  verify('每輪只使用上一個已提交 context', () => {
    assert.deepEqual(history.map(s => s.context.context_revision), Array.from({ length: history.length }, (_, i) => i));
    traces.forEach(t => assert.equal(t.context_revision, t.round - 1));
  });
  verify('RFQ 無競爭者 ID／私有資料，所有競爭條件有真實來源', () => {
    for (const trace of traces.filter(t => t.rfq)) {
      check('SellerRFQ', trace.rfq);
      assert.equal(trace.rfq.max_total_twd, undefined);
      for (const { differences, ...term } of trace.rfq.competitive_terms) {
        assert.ok(history[trace.context_revision].context.offers.some(({ seller_id, offer_id, ...reference }) =>
          seller_id !== trace.seller_id && JSON.stringify(reference) === JSON.stringify(term)));
      }
    }
  });
  verify('最終報價符合金額、期限、庫存、SKU、數量與交期硬限制', () => {
    for (const offer of result.offers) {
      assert.equal(offer.eligibility.status, 'eligible'); assert.ok(offer.total_price_twd <= intent.max_total_twd);
      assert.ok(offer.delivery_days <= intent.delivery_days_max); assert.ok(Date.parse(offer.expires_at) > Date.now());
      const seller = catalog.sellers.find(s => s.seller_id === offer.seller_id);
      const mouse = seller.products.find(p => p.product_id === offer.items[0].product_id);
      assert.ok(offer.total_price_twd >= mouse.floor_price_twd);
      assert.ok(intent.required_features.every(f => mouse.features.includes(f))); assert.equal(mouse.attributes.color, 'black');
      for (const item of offer.items) assert.ok(item.quantity === 1 && seller.products.some(p => p.product_id === item.product_id && p.stock > 0 && p.delivery_days <= offer.delivery_days));
    }
  });
  const offerOf = (seller, variant = 'standalone') => result.offers.find(o => o.seller_id === seller && o.variant === variant);
  verify('A 有讓價，B 保持最快配送', () => {
    assert.ok(offerOf('seller_a').total_price_twd < catalog.sellers.find(s => s.seller_id === 'seller_a').products[0].list_price_twd);
    assert.equal(offerOf('seller_b').delivery_days, 1);
    assert.ok(result.offers.filter(o => o.seller_id !== 'seller_b').every(o => o.delivery_days > 1));
  });
  verify('C 免費周邊與 D 組合便宜 NT$30 均實際出現', () => {
    for (const [id, discount] of [['seller_c', 0], ['seller_d', 30]]) {
      const base = offerOf(id), bundle = offerOf(id, 'bundle');
      assert.equal(base.total_price_twd - bundle.total_price_twd, discount); assert.equal(bundle.optional_addons, true);
      assert.equal(bundle.baseline_offer_id, base.offer_id); assert.ok(bundle.items.some(i => i.category === 'mouse_pad'));
    }
  });
  verify('E 不接受模型降價，第一輪固定 NT$679', () => {
    assert.equal(offerOf('seller_e').total_price_twd, 679);
    assert.equal(result.seller_agents.find(s => s.seller_id === 'seller_e').rounds.length, 1);
  });
  verify('最終 Offer ID 唯一，Evaluator ID 集合完整', () => {
    assert.equal(new Set(result.offers.map(o => o.offer_id)).size, result.offers.length);
    assert.deepEqual([...result.eligible_offer_ids].sort(), result.offers.map(o => o.offer_id).sort());
    assert.ok(result.seller_agents.every(s => s.final_offer_ids.every(id => result.offers.some(o => o.offer_id === id && o.seller_id === s.seller_id))));
  });
  const providers = { openai: 0, deterministic: 0 };
  for (const t of traces) for (const p of [t.buyer_provider, t.seller_provider]) if (p in providers) providers[p]++;
  verify(live ? 'Buyer 與 Seller 均實際成功使用真實模型' : '離線模式完全不呼叫 API', () => {
    if (live) {
      assert.ok(result.usage.calls > 0 && traces.some(t => t.buyer_provider === 'openai') && traces.some(t => t.seller_provider === 'openai'));
    } else assert.equal(result.usage.calls, 0);
  });
  verify('執行未超過固定模型呼叫與 token 預留上限', () => { assert.ok(result.usage.calls <= 50); assert.ok(result.usage.reserved_tokens <= 250000); });
  verify('SQLite Offer 不可變且完整持久化', () => {
    assert.equal(db.prepare('SELECT count(*) AS n FROM negotiation_offers WHERE request_id = ?').get(input.requestId).n, history.at(-1).offers.length);
    assert.throws(() => db.prepare("UPDATE negotiation_offers SET offer_json = '{}' WHERE request_id = ?").run(input.requestId), /immutable/);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  });
  const evaluationStart = performance.now();
  const evaluation = full ? await evaluate({ db, requestId: input.requestId, buyerId: input.buyerId, apiKey,
    model: process.env.EVALUATOR_MODEL || 'gpt-4.1-2025-04-14' }) : null;
  const evaluationDuration = full ? Number(((performance.now() - evaluationStart) / 1000).toFixed(2)) : 0;
  if (evaluation) {
    verify('Evaluator 排完全部七個有效 ID，產生五個賣家方案並符合價格優先', () => {
      assert.equal(evaluation.status, 'awaiting_user'); check('RequestSnapshot', evaluation.snapshot);
      assert.equal(evaluation.snapshot.ranked_offers.length, 7); assert.equal(evaluation.solutions.length, 5);
      const storedInput = JSON.parse(db.prepare('SELECT input_json FROM evaluation_runs WHERE request_id=?').get(input.requestId).input_json);
      validateRanking({ ranked_offers: evaluation.snapshot.ranked_offers }, storedInput);
      assert.ok(!/sponsored|campaign|floor_price|private_policy/.test(JSON.stringify(storedInput)));
      assert.deepEqual(evaluation.snapshot.ranked_offers.map(r => r.offer_id).sort(), [...result.eligible_offer_ids].sort());
      assert.equal(evaluation.snapshot.selected_offer_id, null);
    });
    verify(live ? 'Evaluator 實際採用真實模型排序' : 'Evaluator 離線備援不呼叫模型', () => {
      assert.equal(evaluation.provider, live ? 'openai' : 'deterministic_fallback');
      assert.equal(evaluation.usage.calls, live ? 1 : 0);
    });
    verify('Evaluator 發布快照不可修改，Sponsored 未改變推薦', () => {
      assert.throws(() => db.prepare("UPDATE requests SET published_snapshot_json='{}' WHERE request_id=?").run(input.requestId), /immutable/);
      assert.throws(() => db.prepare("UPDATE evaluation_runs SET result_json='{}' WHERE request_id=?").run(input.requestId), /immutable/);
      assert.notEqual(evaluation.solutions[0].seller_id, input.orchestration.sponsored_placement?.seller_id);
    });
  }
  db.close(); db = new DatabaseSync(dbPath); repository = new NegotiationRepository(db);
  const replay = await negotiate({ ...input, repository, apiKey: '', fetchImpl: () => assert.fail('Replay must not call OpenAI') });
  verify('關閉／重開 SQLite 後重播同一結果，不再付模型費用', () => assert.deepEqual(replay, result));
  verify('其他買家無法讀取執行結果', () => assert.throws(() => repository.existing(input.requestId, 'foreign_buyer'), /not_found/));
  if (evaluation) {
    const evaluationReplay = await evaluate({ db, requestId: input.requestId, buyerId: input.buyerId,
      apiKey: '', fetchImpl: () => assert.fail('Evaluation replay must not call model') });
    verify('Evaluator 關閉／重開 SQLite 後保持相同排名與原因', () => assert.deepEqual(evaluationReplay, evaluation));
    await assert.rejects(evaluate({ db, requestId: input.requestId, buyerId: 'foreign_buyer' }), /not_found/);
  }
  let solutions = salesProfiles.map(profile => {
    const branch = result.seller_agents.find(s => s.seller_id === profile.seller_id);
    return { seller_id: profile.seller_id, label: profile.label, description: profile.description,
      standalone: offerOf(profile.seller_id) ?? null, bundle: offerOf(profile.seller_id, 'bundle') ?? null,
      sponsored: input.orchestration.sponsored_placement?.seller_id === profile.seller_id, stop_reason: branch.stop_reason,
      rounds: traces.filter(t => t.seller_id === profile.seller_id).map(t => ({ round: t.round, target_total_twd: t.rfq?.target_total_twd ?? null,
        outcome: t.result?.outcome ?? t.stop_reason, buyer_provider: t.buyer_provider ?? null, seller_provider: t.seller_provider ?? null,
        offers: history.at(-1).offers.filter(o => o.seller_id === profile.seller_id && o.round === t.round).map(o => ({ variant: o.variant, total_price_twd: o.total_price_twd })) })) };
  });
  if (evaluation) solutions = evaluation.solutions.map(group => ({ ...solutions.find(s => s.seller_id === group.seller_id),
    ranking: group, recommended: evaluation.snapshot.offers.find(o => o.offer_id === group.recommended_offer_id) }));
  const fallbacks = fallbackSummary(traces);
  const duration = Number(((performance.now() - start) / 1000).toFixed(2));
  const report = { mode: live ? 'live' : 'offline', model, started_at: startedAt, duration_seconds: duration,
    request_id: input.requestId, status: evaluation?.status ?? result.status, offer_count: result.offers.length, usage: result.usage, providers, fallbacks,
    ...(full ? { pipeline: { stages: ['Parsed SQLite Request', 'Upstream handoff.prepare / Discovery', 'Five-round manager / registered Sellers', 'Backend validation', 'Evaluator', 'SQLite snapshot / replay'],
      upstream_commit: 'cdce6e5', handoff_id: input.plan.handoff_id, discovery_run_id: input.plan.discovery.run_id,
      policy_version: input.plan.discovery.policy_version, selected_seller_ids: input.orchestration.seller_agents.map(s => s.seller_id) },
      negotiation_duration_seconds: negotiationDuration, evaluation_duration_seconds: evaluationDuration, evaluation } : {}),
    passed: checks.every(c => c.passed), checks, solutions };
  writeFileSync(new URL('result.json', reportDir), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(new URL('report.md', reportDir), reportMarkdown(report));
  writeFileSync(new URL('report.html', reportDir), reportHtml(report));
  console.log(JSON.stringify({ passed: report.passed, checks: checks.filter(c => c.passed).length, total_checks: checks.length,
    duration_seconds: duration, usage: result.usage, providers, evaluation: evaluation ? { provider: evaluation.provider, usage: evaluation.usage, fallback_reason: evaluation.fallback_reason } : null,
    report: fileURLToPath(new URL('report.html', reportDir)),
    solutions: solutions.map(s => ({ rank: s.ranking?.rank, seller: s.seller_id, standalone: s.standalone?.total_price_twd, bundle: s.bundle?.total_price_twd, recommended: s.recommended?.total_price_twd, rounds: s.rounds.length })) }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { db.close(); }
