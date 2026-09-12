# OfferMesh Result Backend

已實作 Express 5、TypeScript 與 SQLite（sql.js）的 Result API。HTTP 正本為 [openapi.json](openapi.json)，資料正本為 [Result v0.2 schema](../contracts/result-api.v0.2.schema.json)。main 的 [完整產品 v0.2 契約](../contracts/a2a-commerce.v0.2.schema.json) 保留五家／五輪設計；目前 Result 使用獨立的三家／兩輪 mock 測資，兩者尚未串接。

## 啟動與測試

使用 Node 20.19.5，在 backend 執行 `npm ci`、`npm run dev`，服務為 http://127.0.0.1:3001。可設定 PORT、HOST、OFFERMESH_DB_PATH。預設資料庫為 backend/data/result-v02.sqlite；同一資料庫只支援一個常駐服務程序。

`npm test`、`npm run typecheck`、`npm run build`；編譯後可執行 `node dist/src/server.js`。從專案根目錄執行 `npm run test:contracts`；真實瀏覽器整合測試見 [frontend](../frontend/README.md)。

## 三個 HTTP 操作

| Method / Path | 輸入 | 成功輸出 |
| --- | --- | --- |
| POST /api/requests | intent_md，選填 preference_md | 202 RequestSnapshot，status=formatting |
| GET /api/requests/{request_id} | request_id | 200 已保存快照，包含 decision |
| POST /api/requests/{request_id}/decisions | action=accept、offer_id，或 action=reject、feedback | 200 AcceptDecisionResult 或 RejectDecisionResult |

所有 POST 必須提供 Idempotency-Key。同 buyer/method/path/key 與相同 body 重播原始成功回應；不同 body 為 409 idempotency_conflict，處理中為 409 request_in_progress（Retry-After: 1）。輸入錯誤 400、未知或跨 buyer 資源 404、決策衝突 409、過期採用 410。demo buyer 由伺服器提供，不接受 client 指定 buyer_id。

accept 保存選定 offer；不付款、不扣庫存、不兌換。reject 保存 feedback 原文及原始 source_documents；不做語意判斷、不改寫 intent、不增 revision、不建立 child。GET 可恢复已保存決策；POST 成功後連線中斷可用原 key 重播。

## 可重現 mock

輸入範例：`辦公用無線滑鼠，預算 900 元含稅運，7 天內到貨。`，preference_md：`價格優先，可接受免費滑鼠墊，不接受付費加購。`

也支援 `Wireless silent mouse under TWD 1000, delivery within 7 days.`，搭配 `Prefer black, small, and symmetrical. Free related accessories are okay.`，以及前端預設文件。預算與天數使用阿拉伯數字；可填「不要滑鼠墊」。未知或互相矛盾的限制回 needs_clarification；有效但無方案回 no_match，不放寬限制湊數。

Result 使用 src/mockResultProvider.ts：三家虛擬賣家、兩輪固定策略、四個最終選項（依限制可能減少），包含歷史報價。新 request 配置新 Offer IDs；價格、期限及結果一旦發布便固定。src/demoPipeline.ts 是保留的舊 pipeline，不由 Result routes 呼叫。

## Buyer Agent 交接

呼叫端接收 reject 的回傳值，例如：

```json
{"action":"reject","request_id":"req_...","status":"rejected","feedback":"不要滑鼠墊，預算改成 800 元。","source_documents":{"revision":1,"intent_md":"原始需求","preference_md":"原始偏好"}}
```

Buyer Agent 之後可用 feedback + source_documents 改寫 intent。此服务只保存和提供資料，没有自動模型、webhook 或 queue 交付；尚未接入時 UI 顯示「回饋已保存」。可從 GET 的 decision 恢復同一份交接資料。

規格：[Result API](../openspec/changes/define-offer-result-ui-api/specs/result-api/spec.md)、[Feedback](../openspec/changes/define-offer-result-ui-api/specs/feedback-loop/spec.md)。
