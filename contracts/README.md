# A2A Commerce shared contracts v0.1

`contracts/` 是四個模組共同使用的資料邊界。API 與內部函式均傳 JSON 值，不傳 filesystem path，也不讓任一模組自行增加未定義欄位。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `a2a-commerce.v0.1.schema.json` | 完整共用型別。root 驗證 `RequestSnapshot`，其他型別用 `#/$defs/<Type>` 引用 |
| `openai/evaluator-output.schema.json` | 可直接放入 Responses API `text.format` 的 Evaluator Structured Outputs 格式 |
| `fixtures/sellers.json` | 三家 Seller、Catalog、庫存、底價、信任與 Campaign 的固定資料 |
| `fixtures/happy-path.json` | 三家 Seller 的兩輪議價、凍結快照與最終排序 |
| `fixtures/edge-cases.json` | 超預算、錯誤交期、過期、未授權加購與不存在 ID 的安全測試 |
| `fixtures/api-examples.json` | 四個 HTTP endpoint 的 request、response 與 idempotency 範例 |

## 模組交接格式

| Producer | Consumer | Schema definition |
| --- | --- | --- |
| API client | Formatter | `CreateRequest`, `DocumentBundle` |
| Formatter | Orchestrator | `NormalizedIntent` |
| Orchestrator | Seller branch | `SellerRFQ` |
| Seller branch | Backend validator | `SellerNegotiationResult` |
| Backend validator | Evaluator | `EvaluatorInput` |
| Evaluator | Backend output validator | `EvaluatorOutput` |
| Backend | UI | `RequestSnapshot`, `DecisionResult`, `RedemptionReceipt`, `ErrorResponse` |

## 共用慣例

- ID 是 1 到 128 字元的不透明字串。消費端不得解析 ID。
- 時間是含 timezone 的 RFC 3339 字串。
- 金額是正整數 TWD，已含稅與運費。
- 所有 object 預設 `additionalProperties: false`。
- `null` 與欄位省略不同。API response 依 schema 明確回傳 `null`。
- `offer_id` 對商品、價格、交期、條款與有效期限的組合不可變。任何商務條件改變都產生新 ID。
- `SellerNegotiationResult` 不包含 `offer_id` 或 eligibility。Seller 以 `draft_ref` 與 `baseline_draft_ref` 關聯同輪方案，Backend 驗證後才配置 immutable `offer_id` 並建立正式 `Offer`。
- `EvaluatorOutput` 只做排序與說明。Backend 必須檢查 ID 集合完整、無重複、rank 連續，再發布結果。

## OpenAI Structured Outputs

`openai/evaluator-output.schema.json` 使用嚴格模式需要的形狀：根節點是 object、所有 properties 都列入 required、每個 object 都設定 `additionalProperties: false`。模型拒答、輸出截斷、schema 不符或 ID 驗證失敗時，Backend 必須使用 deterministic fallback，不可發布部分排序。

## 驗證

```bash
npm run test:contracts
```

此命令不需要安裝第三方 package，會解析全部 JSON，檢查引用完整性、Seller 差異、兩輪議價、硬限制、Sponsored 隔離與 Evaluator 排序。
