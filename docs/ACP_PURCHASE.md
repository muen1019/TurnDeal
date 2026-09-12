# ACP 測試購買 API

更新：目前前端已接入建立結帳、收件資料、確認、取消及訂單恢復，見 [TurnDeal workflow](TURNDEAL_WORKFLOW.md)。以下「本提交未含前端」描述原 PR #2 的交付邊界。

2026-09-12 已實作於 Node 24 整合 runtime。本提交僅交付後端 API，前端接線另行交付。後端透過真正 HTTP 呼叫本地 ACP 測試商家，保存 checkout、模擬付款與訂單。採用只保存選擇；按「確認測試購買」才提交交易。略過不建立購買。

這是測試交易，不會實際扣款或出貨，也不是 ChatGPT Instant Checkout。OpenAI API key 僅用於另行啟用的模型功能，不能用來取得商家交易權限或 ChatGPT 儲存的付款資料。

## 啟動與 API 操作

根目錄執行 `npm run dev` 可啟動整合 API 與 SQLite。透過下列 API 建立結帳、更新資料及提交確認；本提交未提供購買 UI。取消只適用於尚未提交的結帳。

目前 demo buyer 沒有正式登入，服務僅綁定 loopback。

## 購買 API payload

所有 POST 必須提供 `Content-Type: application/json` 與 `Idempotency-Key`。同一操作重試沿用原 key／body；新操作用新 key。使用者身分由後端取得，不接受 payload 指定 buyer ID。下列為本專案 API，並非 OpenAI endpoint。

| 方法與路徑 | Body | 用途 |
|---|---|---|
| POST `/api/requests/{request_id}/purchases` | `{}` | 從已接受報價建立唯一 purchase |
| GET `/api/requests/{request_id}/purchase` | 無 | 重整後依 request 恢復 |
| GET `/api/purchases/{purchase_id}` | 無 | 取得權威狀態與收據 |
| POST `/api/purchases/{purchase_id}/checkout` | 下方範例 | 更新收件資訊／配送選項 |
| POST `/api/purchases/{purchase_id}/complete` | `{"confirmation_token":"<ready 回應的 token>"}` | 明確確認測試購買 |
| POST `/api/purchases/{purchase_id}/cancel` | `{}` | 取消未提交結帳 |

```json
{
  "buyer": {"name": "測試買家", "email": "buyer@example.com"},
  "fulfillment_address": {
    "name": "測試買家",
    "line_one": "測試路 1 號",
    "city": "台北市",
    "state": "TPE",
    "country": "TW",
    "postal_code": "100"
  },
  "fulfillment_option_id": "<checkout.fulfillment_options 中的 id>"
}
```

更新至少傳一個頂層欄位；嵌套物件需完整，未提供的頂層欄位保留原值。不得傳商品、價格、seller_id、offer_id、payment_data、卡號或自選 endpoint；未知欄位拒絕。

回應為 `PurchaseView`，包含 `mode: test`、`payment_execution: simulated`、原 offer、checkout、status、allowed_actions。ready 才有確認 token；修改 checkout 會使舊確認失效。只有 completed 且取得商家 order 才顯示成功收據，付款標記為 `simulated_succeeded`。外部結果未知回 202，前端以 GET 輪詢，不自行另建訂單。完整 request／response／error 定義見 [schema](../contracts/purchase.v1.schema.json) 與 [OpenAPI](../backend/openapi.json)。

## ACP 使用方式與固定版本

依據 [OpenAI Agentic Checkout](https://developers.openai.com/commerce/specs/checkout) 與 [Delegated Payment](https://developers.openai.com/commerce/specs/payment)，本專案把 UI、ACP client、商家與付款執行分開。

上游 `agentic-commerce-protocol/agentic-commerce-protocol` 固定 commit `7fdd78df677a94dce04c770644b0fbbb1401272b` 的 **2025-12-12** checkout schema、checkout OpenAPI、webhook OpenAPI。來源與 SHA-256 見 [manifest](../contracts/acp/manifest.json)，不是浮動追蹤最新版。曾檢查的 2025-09-29 schema 有 JSON Schema 2020-12 相容問題，故未採用，也未修改上游檔案來使其通過。

後端呼叫商家五個端點：create `POST /checkout_sessions`、update `POST /checkout_sessions/{id}`、get `GET /checkout_sessions/{id}`、complete `POST /checkout_sessions/{id}/complete`、cancel `POST /checkout_sessions/{id}/cancel`。請求／回應以固定官方 schema 驗證。

本專案 buyer.name 映射為 ACP buyer.first_name／last_name；配送地址映射至 `fulfillment_details.address`，選项映射至 `selected_fulfillment_options[].shipping`（option_id、item_ids）。Complete 的 `payment_data` 使用 stripe wire fixture，但 token 由本地 simulator 簽發，並非 Stripe／OpenAI 可兌現的 token。內部 confirmation_token 不傳給商家。

每個商家有獨立憑證及本地 HMAC 簽章設定；client 傳 API-Version、Request-Id、Idempotency-Key 與 timestamp。這不是官方 OpenAI 簽章認證。端點由伺服器控制，僅使用 loopback HTTP。事件使用固定 webhook schema 的 `order_create`／`order_update`，送至本專案 `/api/integrations/acp/merchants/{seller_id}/events`，驗簽、去重後以 ACP GET 核對。

## 持久化與正式付款邊界

Migration 005 保存 purchase、操作日誌、商家 session／order、HTTP 冪等資料、事件 inbox／outbox 與獨立測試庫存。商家完成訂單、消耗 token、扣除測試庫存及 outbox 在同一 SQLite transaction；HTTP 呼叫不佔用 SQLite transaction。丟失回應或重啟後使用原操作與 merchant GET 核對。TWD 以整數轉換：NT$799 = 79900 minor units；測試分項總額保留原含稅運報價。

目前僅支援 test。`OFFERMESH_PURCHASE_MODE=live` 會以 `live_checkout_not_configured` 拒絕啟動；模型的 `OFFERMESH_RUNTIME_MODE=live` 不會啟用真實購買。正式付款仍需另行串接商家認可的 PSP 憑證取得、付款／查詢、正式商家端點與 HTTPS、登入及正式環境密鑰管理。現有 test adapter 保留替換位置，尚未提供正式 PSP 實作或官方 conformance 認證。

## 驗證

`npm run test:purchase` 驗證真實 HTTP ACP、契約、隔離、冪等、競爭、回應遺失與重啟恢復。驗證範圍見 [報告](ACP_PURCHASE_TEST_REPORT.md)。本提交不包含前端或瀏覽器 UI 測試。
