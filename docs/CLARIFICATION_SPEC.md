# 需求補充問答（v0.3 擴充）

首頁直接輸入需求，不必先建立 intent.md。Formatter 只追問缺少的必要條件、衝突或不支援的條件；顏色與尺寸是選填，不為了填滿欄位而追問。

優先序：本輪明確需求／補充回答 > preference_md 快照 > SQLite 有效商品偏好。已能從偏好確定的條件直接套用；多個可接受顏色可保留 OR，不必強迫選一個。目標價不能當預算上限，不推定付費加購授權。

## 契約與儲存

- `RequestSnapshot.formatter` 是選填的公開摘要：實際解析來源、模型與結構化問題。舊快照仍可讀取。
- `POST /api/requests` 增加選填 `clarification: {parent_request_id, answers: [{question_id, answer}]}`。原 intent_md 與 preference_md 必須與 parent 文件完全相符，伺服器才可接續。
- 只接受同一 buyer、needs_clarification 的 parent；問題 ID 必須存在、不重複且全部回答。每題最多 500 字，不允許任意修改其他輪文件。
- 建立新的 child request，保留 parent 與 formatter_runs 不變；parent_request_id 現可為 ID，documents.revision 遞增，root_request_id 保留原根。最多 8 次補充、完整 intent_md 最多 20,000 字。
- 同一 parent 只建立一個 child；同 key 同內容重播，不再呼叫模型。不同 key 重複補充回 409。
- 回答會連同欄位標籤附加到 child 的 intent_md；歷史 question/answer 保存在 parent 快照與 idempotency payload。長期 user_preferences 不會被修改。
- reject 後可透過 `refinement` 建立 AI 追問子請求，再用 clarification 回答重新篩選；不改寫原父請求。見 [HISTORY_REFINEMENT.md](HISTORY_REFINEMENT.md)。legacy mock 明確拒絕 clarification/refinement，不假裝已處理。

## 快捷答案

由後端依問題欄位產生，優先使用 preference_md 支援的結構化偏好，再取 SQLite 偏好；排除不接受的選項。沒有可用偏好時才提供標為「參考選項」的範例，並永遠允許手動輸入。點選只填入答案，使用者送出後才生效。文字上限／交期不是可自動套用的猜測。偏好快捷選項目前支援規則解析器可辨識的顏色、尺寸、明確金額與天數；沒有可靠解析時顯示範例，不冒稱個人偏好。

模型回傳通過 schema 與本地驗證才標示 OpenAI；失敗時顯示規則備援。模式設定不等同 API 呼叫成功。真實付款不在本版範圍。

## 驗證

- `npm run test:formatter`、`npm run test:runtime`：偏好選項／排除、原文保留、child 連結、權限隔離、重播與重複提交。
- 前端測試涵蓋點選後可改寫、全部回答才能送出、超長限制、備援標示與回答草稿保存。
- 真實 API 測試須明確設定 `OFFERMESH_LIVE_UI_TEST=1` 再跑 `node tests/clarification-browser.mjs`，會產生付費呼叫，預設測試不執行。
- 2026-09-12 本機已驗證：無線滑鼠需求＋偏好黑色 → LLM 只問最高預算與交期 → 選 1000 元／7 天 → 7 組推薦；父子兩輪 Formatter 均為 gpt-4.1-mini。沒有採用／付款。另一次含目標價輸入觸發 output_evidence，正確使用規則備援；不保證所有 LLM 輸出皆合格。
