# TurnDeal contracts

## Active contracts

| 檔案 | 用途 |
| --- | --- |
| `a2a-commerce.v0.3.schema.json` | Request、Formatter、Orchestrator、Negotiation、Offer、Evaluator 與 Result 共用資料 |
| `openai/evaluator-output.schema.json` | Evaluator Structured Outputs |
| `openai/formatter-output.schema.json` | Formatter Structured Outputs |
| `purchase.v1.schema.json` | Purchase API |
| `../backend/openapi.json` | HTTP API |

`a2a-commerce.v0.3.schema.json` 是所有 active producer、consumer、Ajv validator、generated types 與 fixtures 的唯一共用契約。`archive/` 只供歷史及 migration 測試，不能驗證 live response。

## 核心語意

- `intent_md` 是本輪需求原文。
- CreateRequest 的 `preference_md` 是 request-bound input snapshot，不更新帳戶偏好。
- `NormalizedIntent` 是 Formatter 合併並驗證後的執行資料。
- Status 包含 `formatting`、`orchestrating`、`negotiating`、`evaluating` 與 Result 終態；consumer 必須把中間狀態當成可輪詢狀態。
- Seller response 是 untrusted draft；正式 Offer ID 與 eligibility 由 Backend 決定。
- Sponsored 只供展示，不參與 Seller selection 或 Evaluator ranking。

文件語意見 [intent／preference 規格](../docs/INTENT_PREFERENCE_SPEC.md)，完整資料流見 [系統架構](../docs/SYSTEM_DESIGN.md)。

## HTTP lifecycle

| 操作 | 成功回傳 |
| --- | --- |
| `POST /api/requests` | 202 RequestSnapshot，初始 `formatting` |
| `GET /api/requests/{request_id}` | 200 RequestSnapshot，可能包含 decision |
| `POST /api/requests/{request_id}/decisions` | 200 accepted 或 rejected result |
| `GET /api/preferences`／`POST /api/preferences` | 讀取或明示更新 versioned user preference |

所有 POST 使用 `Idempotency-Key`。Reject 保存原始 feedback 與 source documents，不改寫 Request。Accept 保存同一個 immutable Offer；購買需另外呼叫 Purchase API。

## Fixtures

| 檔案 | 用途 |
| --- | --- |
| `fixtures/sellers.json` | Canonical A–E、商品與來源 |
| `fixtures/sales-profiles.json` | Canonical Persona／policy |
| `fixtures/catalog-negotiation-policies.json` | Discovery Sellers、SKU policies 與 listing bindings |
| `fixtures/marketplace-source-snapshot.json` | 公開來源快照與 synthetic 商務資料 |
| `fixtures/happy-path.json` | 完整可重現流程 |
| `fixtures/document-semantics.json` | Intent／preference precedence |
| `fixtures/buyer-profile.json` | Buyer profile、ranking weights 與 request binding |
| `fixtures/clarification-v0.3.json` | Formatter clarification／child lineage |
| `fixtures/edge-cases.json`、`fixtures/demo-scenarios.json` | 限制、失敗與攻擊情境 |
| `fixtures/api-examples.json` | HTTP request／response 範例 |

執行 `npm run test:contracts` 驗證 schema、refs、fixtures 與跨物件 invariants。任何欄位改名、刪除、型別改變、enum 收窄或狀態語意變更，都要先做 reviewed contract version change，再同步生成型別與 consumers。
