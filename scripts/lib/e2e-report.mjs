const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => value == null ? '—' : `NT$${value}`;
const roundText = round => round.offers.length ? round.offers.map(o => `${o.variant === 'bundle' ? '組合' : '單買'} ${money(o.total_price_twd)}`).join(' / ') : round.outcome;

export function fallbackSummary(traces) {
  return traces.flatMap(t => t.audit.filter(a => a.status === 'fallback').map(a => {
    const call = t.audit.find(c => c.role === a.role && c.model);
    let reason = call?.error ?? a.reason;
    if (a.role === 'seller' && call?.output?.outcome === 'offered') {
      const bound = call.input.price_bounds.find(b => b.product_id === call.output.product_id);
      if (bound && (call.output.total_price_twd < bound.minimum || call.output.total_price_twd > bound.maximum))
        reason = '模型報價超出賣家允許範圍，已由固定策略接手';
      else if (call.input.bundle_required && !call.output.include_bundle)
        reason = '模型遺漏賣家設定的可選搭售方案，已由固定策略接手';
    }
    return { seller_id: t.seller_id, round: t.round, role: a.role, reason };
  }));
}

export function reportMarkdown(report) {
  const rows = report.solutions.map(s => `| ${s.seller_id}・${s.label} | ${money(s.standalone?.total_price_twd)} | ${money(s.bundle?.total_price_twd)} | ${s.standalone?.delivery_days ?? '—'} 天 | ${s.rounds.length} | ${s.stop_reason} |`);
  return `# ${report.evaluation ? 'Orchestrator → 協商 → Evaluator 完整測試' : '五種銷售偏好的協商 E2E 結果'}\n\n` +
    `執行時間：${report.started_at}；模式：${report.mode}；模型：${report.model}；耗時：${report.duration_seconds} 秒。\n\n` +
    `**${report.passed ? 'PASS' : 'FAIL'}**：${report.checks.filter(c => c.passed).length}/${report.checks.length} 項檢查通過。${report.solutions.length} 家 Seller，${report.offer_count} 個最終 Offer，結果狀態 ${report.status}。\n\n` +
    `範圍：${report.pipeline ? 'SQLite 已解析需求 → 遠端 handoff.prepare／Discovery → ' : ''}五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。${report.evaluation ? '另包含獨立 Evaluator 排序。' : '尚不包含 Evaluator 排序。'}不包含 HTTP／UI 操作或交易兌換。\n\n` +
    `## 五套 solution\n\n| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |\n| --- | ---: | ---: | --- | ---: | --- |\n${rows.join('\n')}\n\n` +
    `展示設定：C 同價免費贈品；D 組合包含滑鼠墊且便宜 NT$30。單買與組合各有獨立 Offer ID，因此五張卡片可能有七個 Offer；${report.evaluation ? '本報告依 Evaluator 排名呈現五個賣家方案，完整 Offer 排名如下。' : '這是按賣家分組的展示，不是 Evaluator 推薦排名。'}金額都是模擬商家含稅運 TWD。\n\n` +
    evaluationMarkdown(report) + `## 每輪協商\n\n` + report.solutions.map(s => `### ${s.seller_id} — ${s.label}\n\n${s.description}\n\n| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |\n| --- | ---: | --- | --- |\n` +
      s.rounds.map(r => `| ${r.round} | ${money(r.target_total_twd)} | ${roundText(r)} | ${r.buyer_provider ?? '—'} / ${r.seller_provider ?? '—'} |`).join('\n') +
      `\n\n` + [s.standalone, s.bundle].filter(Boolean).map(o => `- ${o.variant}：${o.offer_id}，有效期限 ${o.expires_at}`).join('\n') + '\n').join('\n') +
    `\n## 模型與 fallback\n\nHTTP 呼叫：${report.usage.calls}；API 已回報 token：${report.usage.actual_tokens}；保守預留 token：${report.usage.reserved_tokens}。採用模型決策 ${report.providers.openai} 次，fallback ${report.providers.deterministic} 次。\n\n` +
    (report.fallbacks.length ? report.fallbacks.map(f => `- ${f.seller_id} 第 ${f.round} 輪 ${f.role}：${f.reason}`).join('\n') : '本次沒有 fallback。') +
    `\n\n## 自動驗證\n\n${report.checks.map(c => `- ${c.passed ? '[x]' : '[ ]'} ${c.name}${c.detail ? `：${c.detail}` : ''}`).join('\n')}\n\n` +
    `本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。\n`;
}

export function reportHtml(report) {
  const e = escapeHtml;
  const cards = report.solutions.map(s => {
    const featured = s.recommended ?? s.bundle ?? s.standalone;
    return `<article><div class="eyebrow">${e(s.seller_id)}${s.sponsored ? ' <span class="sponsor">Sponsored</span>' : ''}</div><h2>${s.ranking ? `#${s.ranking.rank} ` : ''}${e(s.label)}</h2><p class="desc">${e(s.description)}</p>
      <div class="price">${e(money(featured?.total_price_twd))}</div><p>${featured ? `${featured.variant === 'bundle' ? '滑鼠＋滑鼠墊' : '滑鼠單買'} · ${featured.delivery_days} 天到貨` : '沒有有效方案'}</p>
      ${s.ranking ? `<p>${e(s.ranking.reason)}</p><ul>${s.ranking.tradeoffs.map(t => `<li>${e(t)}</li>`).join('')}</ul>` : ''}<dl><dt>單買</dt><dd>${e(money(s.standalone?.total_price_twd))}</dd><dt>搭售選項</dt><dd>${e(money(s.bundle?.total_price_twd))}</dd><dt>停止原因</dt><dd>${e(s.stop_reason)}</dd></dl>
      <details><summary>查看 ${s.rounds.length} 輪協商</summary>${s.rounds.map(r => `<div class="round"><b>Round ${r.round}</b><span>Buyer 目標 ${e(money(r.target_total_twd))}</span><p>${e(roundText(r))}</p><small>${e(r.buyer_provider)} / ${e(r.seller_provider)}</small></div>`).join('')}</details>
      <details><summary>有效 Offer ID</summary>${[s.standalone, s.bundle].filter(Boolean).map(o => `<p>${e(o.variant)}<br><code>${e(o.offer_id)}</code></p>`).join('')}</details></article>`;
  }).join('');
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OfferMesh · 五家協商 E2E</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#163b32;font:16px/1.65 system-ui,"Microsoft JhengHei",sans-serif}main{max-width:1440px;margin:auto;padding:44px 28px}header{margin-bottom:30px}h1{font-size:clamp(28px,3vw,44px);line-height:1.25;margin:12px 0}.eyebrow{font-size:12px;letter-spacing:1px;color:#54736a}.stats{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.stats span{padding:9px 16px;background:#e3ede7;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}article{border:1px solid #d7e1da;border-radius:14px;background:white;padding:22px 18px;min-width:0}h2{font-size:23px;line-height:1.3;margin:14px 0}.desc{min-height:82px;font-size:14px;color:#526b63}.price{font-size:34px;font-weight:750;letter-spacing:-1px}.sponsor{font-size:10px;background:#fff1c9;padding:2px 5px;letter-spacing:0}dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;border-top:1px solid #eee;padding-top:14px}dd{margin:0;text-align:right;overflow-wrap:anywhere}details{font-size:13px;border-top:1px solid #e6ece7;padding:12px 0}summary{cursor:pointer}.round{padding:12px 0;border-bottom:1px solid #eee}.round span{display:block;color:#64766e}.round p{margin:5px 0}code{font-size:10px;overflow-wrap:anywhere}section{margin-top:32px;background:white;padding:24px;border-radius:14px}.checks{columns:2;list-style:none;padding:0}.checks li{margin:8px 0;break-inside:avoid}.note{color:#607168;font-size:13px;max-width:1000px}.pass{color:#19734c}.fail{color:#a52531}@media(max-width:1100px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.grid{grid-template-columns:1fr}.checks{columns:1}.desc{min-height:0}}</style>
    <main><header><div class="eyebrow">OFFERMESH / NEGOTIATION E2E / ${e(report.mode.toUpperCase())}</div><h1>五種銷售偏好，五套可比較方案</h1><p>同一需求：黑色無線靜音滑鼠，含稅運 NT$1,000 內，7 天內到貨。配件可拒絕。</p>
    <div class="stats"><span class="${report.passed ? 'pass' : 'fail'}">${report.passed ? 'PASS' : 'FAIL'} · ${report.checks.filter(c => c.passed).length}/${report.checks.length} 檢查</span><span>${report.duration_seconds} 秒</span><span>${report.usage.calls} 次協商 API 呼叫</span><span>${report.offer_count} 個有效 Offer</span><span>${report.providers.deterministic} 次 fallback</span></div><p class="note">${e(report.started_at)} · ${e(report.model)}。${report.pipeline ? 'SQLite 已解析需求 → 遠端 handoff.prepare／Discovery → ' : ''}協商 → 驗證 → SQLite 重播${report.evaluation ? ' → Evaluator 排序' : ''}。不含 HTTP／UI 操作或交易兌換。</p></header>
    <div class="grid">${cards}</div><p class="note">${report.evaluation ? '五張卡依各賣家最高排名的 Offer 排序；完整七個 Offer 排名保留於下表。' : '五張卡按賣家分組，非推薦排名。'}C／D 保留單買與組合兩個獨立 Offer；點開卡片可查看每輪實際價格。Sponsored 不影響協商選取或推薦。報價為虛擬商家測試資料。</p>
    ${evaluationHtml(report)}<section><h2>自動驗證</h2><ul class="checks">${report.checks.map(c => `<li class="${c.passed ? 'pass' : 'fail'}">${c.passed ? '✓' : '✕'} ${e(c.name)}${c.detail ? ` — ${e(c.detail)}` : ''}</li>`).join('')}</ul></section>
    <section><h2>模型執行情況</h2><p>採用模型決策 ${report.providers.openai} 次 · fallback ${report.providers.deterministic} 次 · API 已回報 ${report.usage.actual_tokens} tokens</p>${report.fallbacks.length ? `<ul>${report.fallbacks.map(f => `<li>${e(f.seller_id)} / Round ${f.round} / ${e(f.role)}：${e(f.reason)}</li>`).join('')}</ul>` : '<p>本次沒有 fallback。</p>'}<p class="note">價格與停止輪次是這次執行的快照；後續模型執行可能不同。私有底價與原始 prompts 未放入報告。</p></section></main></html>`;
}

function evaluationMarkdown(report) {
  if (!report.evaluation) return '';
  const evaluation = report.evaluation;
  return `## Evaluator 排名\n\n來源：${evaluation.provider}；模型：${evaluation.model ?? 'offline'}；耗時 ${report.evaluation_duration_seconds} 秒；呼叫 ${evaluation.usage.calls} 次；API tokens ${evaluation.usage.actual_tokens}；fallback：${evaluation.fallback_reason ?? '無'}。\n\n| 排名 | Seller | 選項 | 含稅運 | 到貨 | 原因 |\n| --- | --- | --- | ---: | --- | --- |\n` +
    evaluation.snapshot.ranked_offers.map(r => {
      const o = evaluation.snapshot.offers.find(o => o.offer_id === r.offer_id);
      return `| ${r.rank} | ${o.seller_id} | ${o.variant} | ${money(o.total_price_twd)} | ${o.delivery_days} 天 | ${r.reason.replaceAll('|','／')} |`;
    }).join('\n') + '\n\n';
}
function evaluationHtml(report) {
  if (!report.evaluation) return '';
  const e = escapeHtml, evaluation = report.evaluation;
  return `<section><h2>完整 Offer 排名</h2><p>Evaluator：${e(evaluation.provider)} · ${e(evaluation.model ?? 'offline')} · ${report.evaluation_duration_seconds} 秒 · ${evaluation.usage.calls} 次 API · ${evaluation.usage.actual_tokens} tokens</p><p>fallback：${e(evaluation.fallback_reason ?? '無')}。七個 Offer 都被保留；採用與購買需由使用者另外確認。</p><ol>` +
    evaluation.snapshot.ranked_offers.map(r => {
      const o = evaluation.snapshot.offers.find(o => o.offer_id === r.offer_id);
      return `<li><b>${e(o.seller_id)} · ${e(o.variant)} · ${e(money(o.total_price_twd))} · ${o.delivery_days} 天</b><p>${e(r.reason)}</p><small>${r.tradeoffs.map(e).join('；')}</small><br><code>${e(r.offer_id)}</code></li>`;
    }).join('') + '</ol></section>';
}
