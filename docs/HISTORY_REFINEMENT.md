# 歷史側欄與拒絕後再篩選

## 本次功能

- 手機：導覽按鈕展開左側抽屜，背景不可操作。可按遮罩、關閉、Escape，選擇對話後自動收合；支援鍵盤焦點循環與 reduced motion。
- 每筆歷史獨立「刪除 → 確認／取消」。刪除本分頁 sessionStorage 中的對話、回答草稿、略過紀錄；刪最後一筆會產生空白對話。
- **不是 SQLite 資料抹除**：已發布的報價、請求、拒絕理由、決策及 idempotency 稽核保留；持有原 request URL 仍可讀取。全帳號刪除與資料保留政策需另訂。處理中及結果不明的提交不允許刪除。

## Workflow

1. 所有方案左滑後顯示回饋欄；使用者說明不適合的原因並送出。
2. POST `/api/requests/{id}/decisions` 保存原始 reject；不改寫已發布文件。
3. 前端接著 POST `/api/requests`，帶原 `intent_md`、`preference_md` 及 `refinement: { parent_request_id }`。
4. 後端建立一個問題子請求（202），使用本輪選定模型（新需求預設 GPT-5.6 Sol）根據原 intent、偏好及拒絕原因提出 1–3 個具體問題／快捷選項。未設定 key、超時或不合法輸出使用明確標示的規則追問。
5. 問題與來源模型存於 SQLite `requests.result_state_json.formatter`，狀態 `needs_clarification`。同一 rejected 父請求重送不同 key 也回傳同一子請求，不重複付費追問。
6. 回答沿用 `clarification: { parent_request_id, answers }` 建立下一子請求，重新走 Formatter → Orchestrator → Negotiation → Evaluator。回答必須全部完整且每題 ≤500 字，快捷選項不自動選取。

只准同一 buyer、原文件完全相同、已 rejected 的父請求。`clarification` 和 `refinement` 互斥，修訂上限 9；開始追問需預留下一輪回答的 revision。新子請求繼承原權重，姓名、運送地址、結帳方式不送模型。沒有自動更新長期偏好、沒有自動付款。

原有硬預算和交期保留；只有買家明確的新回答可修改，不能把參考選項当授權。重新篩選不保證出現全新商品：目前已有 20 個具備策略的賣家可議價，條件未變時可能重複；不會為湊數放寬硬限制。

## 這次故障與修正

- `1000元滑鼠`：離線規則以前把金額列為未理解。現在辨識為目標價，仍確認含運上限、交期。LLM prompt 同樣區分目標與硬上限，避免安全驗證把裸金額誤判成已授權預算。
- 有報價卻沒有推薦：`rankOffers` 重建 EvaluatorInput 時沒有帶 catalog，原有 `color_matches` 被清零；排序後和發布前的完整資料比較，觸發 `ranking_preference_order`。改成保留已驗證的完整輸入，模型及離線 fallback 使用同一評分資料。
- 中斷時依解析／篩選／議價／排序階段顯示錯誤；不再一律顯示成需求不明。
- 整合 Runtime 全流程沿用每輪模型，預設 GPT-5.6 Sol，前端可切換新需求模型；key 仍只透過安全終端輸入。完整範圍與合併紀錄見 [MODEL_HISTORY_SYNC.md](MODEL_HISTORY_SYNC.md)。

官方模型相容性：[GPT-4.1（Responses、Structured Outputs）](https://developers.openai.com/api/docs/models/gpt-4.1)。這是升級理解品質的相容選擇，不宣稱最新或最便宜模型。

測試：`npm run test:runtime`、`npm run test:formatter`、`npm --prefix frontend test`、`node tests/history-refinement-browser.mjs`（隔離 DB、無付費呼叫）。
