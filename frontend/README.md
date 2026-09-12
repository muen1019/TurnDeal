# OfferMesh Chat 與商品滑卡

完整接線已完成：請在專案根目錄以 Node 24 執行 `npm run dev`，前端自動連到整合 API 3201。預設為離線策略模式；`npm run dev:secure` 可隱藏輸入 key 啟用模型。詳見 [完整接線說明](../docs/RUN_FULL_APP.md)。

已實作 React、TypeScript、Vite 工作區。Chat 可直接把本次輸入作為 CreateRequest.intent_md，不必先儲存代理設定；若有已儲存模板與偏好則一併套用。整合入口執行 Formatter、搜尋、議價與評估；legacy Result 後端仍提供 mock 商品組合，前端依後端排名顯示。

UI 使用滿版水藍色背景，沒有米色底與外框。整頁不捲動，工作區依視窗可用高度調整；長對話、文件和明細只在元件內捲動。商品頁與回饋頁不顯示原始 JSON、識別碼、決策資料或交接文件。

## 啟動

使用 Node 20.19.5，於 frontend 執行 `npm ci`、`npm run dev`，搭配已啟動的 3201 API。開啟 http://127.0.0.1:5173/chat，直接輸入「辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。」並送出。代理設定為選填，可只儲存偏好或清空模板，不會改寫既有需求。自行啟動後端的預設 port 為 3001 時，請將前端 OFFERMESH_API_ORIGIN 設為 http://127.0.0.1:3001；不須修改程式碼。

Vite 將相對 /api 轉送到使用者提供的 http://127.0.0.1:3201。可用環境變數 OFFERMESH_API_ORIGIN 覆寫 origin（不含 /api）。API path 由 backend/openapi.json 產生，型別與執行期驗證共用 contracts/a2a-commerce.v0.3.schema.json；`npm run generate:types` 更新生成檔。

## 決策行為

- 右滑或「立即採用」送出 accept；保存成功後顯示決策摘要。
- 左滑／略過只改本機狀態；全部略過後可填回饋，明確送出才呼叫 reject。
- reject 回 200/rejected，保存 feedback 原文與原始文件，不改寫 intent 或自動開始下一輪。
- GET snapshot.decision 恢復 accept/reject。POST journal 保存原 key/body，逾時後核對原提交；未知結果時鎖定新操作。
- Buyer Agent 尚未接入；沒有付款、兌換或庫存扣減 API。

HTTP 詳細輸入輸出見 [backend README](../backend/README.md) 與 [OpenAPI](../backend/openapi.json)。

## 驗證

正式模式進度來自共用 RequestSnapshot，不呼叫額外的 `/progress` API。詳細開發 mock 進度與啟用方式見 [AGENT_PROGRESS.md](AGENT_PROGRESS.md)。

`npm test`、`npm run typecheck`、`npm run build`。

Result API 瀏覽器測試：先安裝 Python Playwright（`python -m pip install playwright`、`python -m playwright install chromium`），再執行 `npm run test:api:e2e`。runner 編譯前後端，啟動獨立 backend（隨機可用 port）、production build 的 Vite preview 5188 與暫存 SQLite，避免開發熱更新干擾；測試結束自動關閉。截圖與 result-api-e2e.json 在 test-results/。測試涵蓋建立需求、右滑採用、鍵盤略過、拒絕、重載恢復與原始 handoff，並斷言僅呼叫三個已定義的 API 路由。

`npm run test:e2e` 執行 UI／視覺驗收：真實 Chat 送出、左右拖曳、撤回、完整明細、採用／拒絕及重載，並量測滿版背景、同尺寸工作區、窄螢幕、低高度與 reduced-motion。預設使用隔離的暫存資料庫及 5187 → 3101 測試服務；設定 OFFERMESH_E2E_EXTERNAL_URL=http://127.0.0.1:5173 可測試目前服務。詳見 [UI 驗證紀錄](UI_VALIDATION.md)。

設計參考：[img/design](img/design/)。[OpenSpec tasks](../openspec/changes/define-offer-result-ui-api/tasks.md) 保留尚未驗收的細部動畫與真機觸控項目。

## 與其他 session 共用工作區

可先編譯 backend，再在 frontend 執行 `node scripts/start-result-demo.mjs`，使用獨立的 5273 UI / 3201 API 與 backend/data/result-preview.sqlite。此入口避免占用另一個 session 的 5173 / 3001。
