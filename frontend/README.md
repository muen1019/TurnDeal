# TurnDeal frontend

React／TypeScript／Vite 單頁介面，提供 Chat、request-bound 設定、Agent 階段、Seller／輪次狀態、Offer cards、details、accept／reject 與 reload recovery。

完整應用請從 repository root 使用 Node 24 啟動：

```powershell
npm run dev
```

前端會在 <http://127.0.0.1:5173/chat> 開啟，並把 `/api` 代理到 integrated runtime 的 3201 port。Live model 模式使用 root 的 `npm run dev:secure`；API key 不得進入 Vite environment。

## 獨立啟動

Frontend package 使用 Node 20.19.5：

```powershell
npm ci
$env:OFFERMESH_API_ORIGIN = 'http://127.0.0.1:3201'
npm run dev
```

`OFFERMESH_API_ORIGIN` 不含 `/api`。HTTP 定義來自 [OpenAPI](../backend/openapi.json)，資料型別與 runtime validation 使用 [v0.3 contract](../contracts/a2a-commerce.v0.3.schema.json)；`npm run generate:types` 更新生成檔。

程式碼中的 `OFFERMESH_*` 是相容性環境變數名稱。

## UI 行為

- Chat 把已儲存的 session template 與本次輸入組成 CreateRequest；它不是帳戶長期偏好。
- UI 依 `RequestSnapshot.status` 顯示 formatting、orchestrating、negotiating、evaluating 與結果。
- 左滑只保存在本機 skipped state；全部略過並明確送出才建立 reject decision。
- 右滑或「立即採用」提交 accept；成功後顯示 decision summary。
- POST journal 保存 exact key／body，未知結果時先用同 key 重試或 GET 核對，不能建立重複 decision。
- GET snapshot 恢復 Request、Offer 與 decision。UI 不顯示 private prompt、raw audit、底價或 Campaign ranking data。
- 採用不是購買；目前 purchase API 尚未接入 UI。

## Progress 與開發 mock

正式模式只輪詢 `GET /api/requests/{request_id}`，不呼叫額外 progress endpoint，也不用計時器猜測完成狀態。

只有 Vite dev 且 `OFFERMESH_DEV_MOCK=1` 時，UI 才查詢 dev-only `GET /__mock/requests/{request_id}/progress`。這個 sidecar 不屬於 OpenAPI 或共用 contract；production build 會停用。較舊 sequence、錯誤 request ID 或非法 stage 不覆蓋 snapshot，404 則退回正式 status。

```powershell
$env:OFFERMESH_DEV_MOCK = '1'
npm run dev -- --port 5174
```

Mock 只用於檢視固定流程，不執行 Agent、購買或付款。

## 驗證

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run test:api:e2e
```

E2E 使用隔離 SQLite 與測試 services，涵蓋 Chat submit、drag／keyboard、undo、details、accept／reject、reload、窄螢幕、低高度與 reduced motion。輸出位於被 Git 忽略的 `test-results/`；完整政策見 [測試指南](../docs/TESTING.md)。

設計參考位於 `img/design/`。尚未完成的逐幀動畫與真機觸控驗收保留在 [OpenSpec tasks](../openspec/changes/define-offer-result-ui-api/tasks.md)。
