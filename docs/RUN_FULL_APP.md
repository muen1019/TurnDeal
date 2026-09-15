# 完整前後端啟動與接線

## 最快啟動

整合入口使用 **Node 24**。第一次在根目錄安裝依賴：

```powershell
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run dev
```

開啟 http://127.0.0.1:5173/chat，先「開啟代理設定」→「儲存設定」，回到 AI 對話輸入：

```text
滑鼠800元左右，預算1000元含稅運，7天內到貨。
```

`npm run dev` 預設是完整離線模式：不呼叫模型，但會真的執行 Formatter 規則、Discovery 排序、五家 Seller 策略議價、獨立 Evaluator fallback，以及 SQLite 決策保存。不是固定回傳舊 Result fixture。前端會標示「未呼叫 LLM」。

## 真實模型模式

先停止現有 `npm run dev`（Ctrl+C），再執行：

```powershell
npm run dev:secure
```

在隱藏輸入提示貼上新的 OpenAI key，**不要貼到 Chat、商品需求、Git 或前端環境變數**。key 只留在啟動器與後端 process environment，結束後還原；不寫入檔案，不傳給 Vite 子程序。舊版曾公開貼出的 key 應先撤銷。

也可在受保護的伺服器環境設定 OPENAI_API_KEY（或 API_KEY）與 OFFERMESH_RUNTIME_MODE=live。預設不自動讀取 .env、不自動花費 API 額度。Formatter、Buyer/Seller、Evaluator 沿用各模組既有模型；每個需求可能有多次模型呼叫，各模組保留既有 timeout／預算與安全 fallback。前端的 live 標示代表啟用模型，不保證每一次呼叫都成功；實際 provider 與 audit 留在本地 DB，不公開私有 prompt。

## 已串接的流程

1. Chat POST /api/requests，立刻取得 202 / formatting 與固定 request_id。
2. 同一筆 Request 經 Formatter：讀取該使用者的 SQLite 偏好、解析硬限制、保存 formatter_runs。資訊不足回 needs_clarification。
3. 既有 Discovery／Handoff 從已配置的 A–E 目錄選出合格 Seller。硬條件不符的 alternative 不啟動議價。
4. 完整 negotiation manager 派出 Buyer/Seller，最多五輪，同輪平行、輪間同步；不重複呼叫舊的第一輪 dispatcher。
5. Evaluator 重新驗證並排序，保存 immutable RequestSnapshot。
6. 前端透過原 GET /api/requests/{id} 輪詢狀態並呈現商品卡。
7. POST /api/requests/{id}/decisions 保存採用或拒絕。採用時重新驗證 provenance、庫存、價格、規格、交期、條款、期限與配件授權。拒絕保存原始 feedback/source_documents；尚未自動更新長期偏好。

共用契約包含 orchestrating、negotiating、evaluating 三個 processing Status；生成型別與前端進度判斷保持同步。採用後可呼叫購買 API 建立 ACP 測試 checkout，提交明確確認後完成模擬訂單；目前尚未提供購買 UI。六個購買端點、payload 與模式邊界見 [ACP_PURCHASE.md](ACP_PURCHASE.md)。沒有真實扣款或 redemption endpoint。

## 資料與既有模組

- 真正運行的整合 API：backend/runtime/，Node 24 + node:sqlite，port 3201。
- frontend/：原介面，port 5173，/api 代理到 3201，停用開發 mock。
- data/app.sqlite：這個整合展示的單一 DB，保存需求、Formatter、搜尋快照、議價歷史、Evaluator、採用／拒絕及 idempotency。
- data/offermesh.sqlite、backend/data/result-v02.sqlite：既有資料保留，不覆寫、不合併歷史。Runtime 新 DB 初次載入 fixtures 與已確認的 A–E sales profiles；重啟不重設庫存或價格。
- 120 筆／15 家 Discovery 商品已透過新版 catalog-negotiation-policies.json 補入獨立 SKU、Persona、私有政策及模擬履約證據，與 canonical 五家合計 20 家／129 筆庫存。啟動時執行一次版本化補資料；已存在的價格、庫存、權益額度與歷史快照不重設。也可執行 npm run db:seed:policies。舊空白 draft template 留作歷史資料，不是 runtime 設定。詳見 [完整 Catalog 談判政策](CATALOG_NEGOTIATION_POLICIES.md)。
- backend/src/mockResultProvider.ts 與舊 Node 20 server 留作相容測試；完整展示請從根目錄 npm run dev 啟動，不要啟動舊 backend npm run dev。
- 同一 DB 只能有一個運行中的寫入服務。啟動器若發現 3201／5173 已被使用會停止，避免誤接舊服務。
- Demo 固定伺服器端 buyer 身分，只綁定 127.0.0.1；尚未提供正式登入，勿直接公開到網際網路。

## 驗證

```powershell
npm test
npm --prefix backend test
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run build
# 先啟動 npm run dev，再用已安裝的 Edge 執行完整 UI 測試：
node tests/runtime-browser.mjs
```

瀏覽器測試在本地展示 DB 新建測試需求並模擬採用，沒有付款；輸出截圖到 frontend/test-results/runtime/。可用 OFFERMESH_BROWSER_CHANNEL=chrome 改用已安裝的 Chrome。

離線 HTTP／SQLite／瀏覽器端到端及 live adapter 的 mock transport 都有可重跑測試；範圍與 live 成功判定見 [測試指南](TESTING.md)。
