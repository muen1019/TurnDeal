# A2A Commerce shared contract v0.3

唯一有效契約為 [a2a-commerce.v0.3.schema.json](a2a-commerce.v0.3.schema.json)。Backend OpenAPI、前後端生成型別、Ajv 驗證器與目前 fixtures 全部引用此契約。

協商功能遷移至 v0.3：五家 Seller、最多五輪、明確 final 與 Backend 停止原因。本次依使用者確認的新版 spec，新增 optional `SellerRFQ.competitive_terms`、`SellerNegotiationResult.withdrawn_offer_ids`，以及 `CompetitiveOfferReference`、`SharedNegotiationContext`、`NegotiationOutput`。舊 payload 可省略 optional 欄位，既有 fixtures 仍有效；新增 `fixtures/negotiation-sharing.json` 驗證上一輪來源與去識別化邊界。Evaluator 契約不變。[目標 System Design](../docs/SYSTEM_DESIGN.md) 的 Swipe、文件修訂與長期偏好尚未遷移。

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

## Formatter 函式交接

Formatter service 回傳 v0.3 的新增 FormatterResult（ready 或 needs_clarification，含問題、警告、NormalizedIntent 與選填目標價）。這是函式工具輸出，不是新 HTTP endpoint。

LLM Formatter → Discovery 前五家 → 私有 SellerRFQ 已在根目錄 service/demo 串接。Result server 仍使用 deterministic mock，尚未接上這條真實入口；沒有正式模型議價或 intent 回饋改寫。

openai/evaluator-output.schema.json 與 openai/formatter-output.schema.json 分別定義兩個模型的嚴格輸出，不可混用。fixtures/formatter-scenarios.json 提供解析與澄清測資，執行 npm run test:formatter 驗證。
