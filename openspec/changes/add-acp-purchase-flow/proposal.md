## Why

目前 accept 只保存選中的方案，沒有購買階段。使用者要求在自己的 OfferMesh UI 操作，透過 OpenAI 公開的 Agentic Commerce Protocol（ACP）執行結帳；已確認第一版採 ACP 測試交易與訂單流程，預留正式付款串接。

ACP 是商家與 client 間的交易協定。使用協定不等於呼叫 OpenAI 託管購買 API、不會自動取得商家存取權，也不代表接入 ChatGPT Instant Checkout。這些差異需要成為可驗收的規格。

## What Changes

本提交僅含後端、契約、資料庫與測試；前端實作及 UI OpenSpec 不在本提交內。以下測試交易範圍已於 2026-09-12 接入整合 runtime；驗證結果見 docs/ACP_PURCHASE_TEST_REPORT.md。正式商家／PSP 付款仍未實作。

- 定義自有 UI → PurchaseService → ACP HTTP client → 商家測試端 → 模擬付款／訂單的完整流程。
- 定義 ACP create、update、get、complete、cancel 的角色、payload、版本固定、認證與訂單核對。
- 定義 buyer-scoped 購買 API 的 request／response payload、HTTP 狀態、冪等鍵與錯誤。
- 要求 accepted immutable offer、checkout 摘要與使用者確認綁定，禁止跳過確認、任意加價或商品替換。
- 定義測試付款、資料持久化、並行去重、逾時／程序重啟恢復，以及訂單事件。

## Capabilities

### New Capabilities

- `acp-checkout-integration`: ACP 商家測試服務、HTTP client、協定與付款邊界。
- `purchase-api`: accepted offer 購買資源、payload、交易確認、持久化與恢復。

### Modified Capabilities

無已封存 capability 修改。既有 `define-offer-result-ui-api` 的 accept／skip／reject 保持現行語意；新增購買能力不代表其歷史 redemption 提案已上線。

## Impact

預計實作於 Node 24 的 `backend/runtime`、SQLite migrations、獨立 purchase contract、ACP vendor contracts、OpenAPI 與測試。`backend/src` 的 legacy Node 20 相容服務及 Buyer Request Improver 不納入修改。

本 change 依使用者明確指示，對 `openspec/config.yaml` 的舊有「keep payment outside this change」規則作局部範圍修訂：允許 ACP 模擬交易與測試訂單，不允許真實扣款。Node 20 規則僅適用 legacy backend／frontend，整合 runtime 保持 Node 24。其他 change 的範圍不受影響。

不新增真實商家帳號、不部署正式金流、不提供 ChatGPT 已存付款資料存取、不執行退款／出貨、不將 request 視為購物車。規格驗證完成不代表 API、交易或 OpenAI 認證已完成。
