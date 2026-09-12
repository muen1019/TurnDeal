# A2A Commerce shared contract v0.3

唯一有效契約為 [a2a-commerce.v0.3.schema.json](a2a-commerce.v0.3.schema.json)。Backend OpenAPI、前後端生成型別、Ajv 驗證器與目前 fixtures 全部引用此契約。

## main 與 local 的合併

- 使用 main 的商品 Catalog、來源快照、最多五家 Seller／五輪、is_final、stop_reason 與 Offer 型別。
- 使用 local 的 accept/reject=200、RequestSnapshot.decision，以及 reject 的 feedback/source_documents 原文交接。
- reject 不改寫文件、不增加 revision、不建立 child、不扣庫存、不付款或兌換。
- 舊版 schema 及舊 Result 測資放在 archive/，僅供歷史與遷移驗證，不能拿來驗證現行 HTTP response。

## 現行 API

| 操作 | 成功回傳 |
| --- | --- |
| POST /api/requests | 202 RequestSnapshot，formatting |
| GET /api/requests/{request_id} | 200 RequestSnapshot，包含 decision |
| POST /api/requests/{request_id}/decisions | 200 DecisionResult，accepted 或 rejected |

所有 POST 需要 Idempotency-Key。HTTP 定義見 [OpenAPI](../backend/openapi.json)。Redemption 的資料型別保留供後續整合，但沒有現行 endpoint；舊範例已移到 archive/redemption-example.v0.2.json。

## Fixtures

| 檔案 | 用途 |
| --- | --- |
| fixtures/sellers.json | 五家賣家、九個商品、來源連結及模擬策略 |
| fixtures/marketplace-source-snapshot.json | 公開來源快照；來源價格與模擬商務欄位分離 |
| fixtures/happy-path.json | 五家／最多五輪交換紀錄與六個最終 Offer |
| fixtures/api-examples.json | 三個現行 HTTP 操作的輸入輸出 |
| fixtures/result-v0.3.json、result-api-v0.3.json | 與上述正本一致的 UI 測試入口 |
| fixtures/edge-cases.json、demo-scenarios.json | 限制、錯誤與模型攻擊場景 |

執行根目錄 `npm run test:contracts`。時間使用 RFC 3339，ID 為不透明字串，金額為含稅運整數 TWD。後端配置 immutable offer_id；模型與前端不能自行改價、放寬限制或改排名。Sponsored 僅供展示，不影響賣家選擇或推薦。

`openai/evaluator-output.schema.json` 保留 Evaluator Structured Outputs 形狀；目前 Result 使用 deterministic mock，沒有正式模型議價或 intent 改寫。
