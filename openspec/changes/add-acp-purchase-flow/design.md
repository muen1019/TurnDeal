## Context

此 ACP 後端測試購買已實作並驗證。decisions 保持只保存 accept／reject，獨立 purchase 端點經 HTTP 呼叫 ACP 測試商家，保存模擬付款及訂單；可重跑驗證見 docs/TESTING.md。

現有 A–E 為虛擬賣家，所以第一版須同時建置 ACP client 與 merchant test service。ACP 不自動提供可購買商品、商家 endpoint、存取憑證或付款帳號。

官方依據（查閱日期 2026-09-12）：

- [Agentic Checkout Spec](https://developers.openai.com/commerce/specs/checkout)：商家提供 checkout REST 介面；協定公開，ChatGPT Instant Checkout 則有合作准入要求。
- [Delegated Payment Spec](https://developers.openai.com/commerce/specs/payment)：付款由商家與 PSP 執行；ChatGPT 委託付款的 token 不能由一般 OpenAI API key 或外部 UI 自行取得。

此 change 的 specs 是本次需求與驗收依據，API payload 的明確定義以 `purchase-api/spec.md` 為準。

## Goals / Non-Goals

Goals：後端 API 支援 accept → checkout → 明確確認 → ACP complete → 持久化測試訂單，實際跨 HTTP 邊界驗證協定；能處理重複點擊、資料篡改、逾時與重啟。

Non-goals：真實扣款、真實卡號收集、ChatGPT Instant Checkout 上架、多商家購物車、退款／出貨、改變 skip/reject 或 improver。

本 change 的 Node 24 runtime 與測試交易範圍覆蓋 config 中舊有的全域 Node 20／排除 payment 敘述；不改動其他 change 的約束。

## Decisions

### 1. 採分離的協定 client 與商家測試端

選擇 PurchaseService + AcpClient + AcpTestMerchant + PaymentExecutor。另一方案是直接接外部商家與 PSP 測試帳號，但目前未取得其能力與憑證；僅在 accept 後寫入本地訂單則無法驗證 ACP，不採用。

可由單一 Node 程序、單一 SQLite 檔案承載。AcpClient 仍須發 HTTP 請求，不得直接呼叫 merchant 函式或讀 merchant 表判定購買成功。公開通訊使用 HTTPS；loopback HTTP 限本地測試。endpoint 由 seller 設定 allowlist 取得，不接收使用者 URL。

Merchant credentials、API-Version、Request-Id、Idempotency-Key、簽章、Timestamp 由 server adapter 設定。第一版簽章採 per-merchant 測試 HMAC 與重放時間窗，標示為本地整合設定；不宣稱正式 OpenAI 簽章驗證通過。開發測試 client 不冒充 ChatGPT User-Agent。

### 2. 固定協定版本，區分內外資料契約

已固定上游 commit `7fdd78df677a94dce04c770644b0fbbb1401272b` 的 2025-12-12 schema／OpenAPI，來源與 hash 見 contracts/acp/manifest.json。未採用曾檢查的 2025-09-29，因其 JSON Schema 2020-12 驗證與 completed response 定義存在相容問題。保留上游檔案原樣，以固定版本驗證 HTTP 請求／回應。

文件概述與事件物件表的事件命名不一致，第一版只能依所固定 schema 使用單一 wire enum。自訂 PurchaseView 狀態與 `mode=test` 放在內部 envelope，不能擴充 ACP enum。PSP fixture 若使用 stripe provider，只驗證其 wire shape，token 是本地模擬憑證，非 Stripe／OpenAI 簽發。

新增 `contracts/purchase.v1.schema.json` 描述內部 payload，引用既有 v0.3 Offer 定義；`contracts/acp/` 存固定外部契約。OpenAPI、fixtures、validator、generated types／routes 同步產生與驗證。原 RequestSnapshot、AcceptDecisionResult、RedemptionReceipt 不變。

### 3. 以 accepted offer 建立結帳

每個 request 最多一個 purchase。create body 為空物件，server 讀取 accepted decision，建立 buyer、seller、offer 不可變綁定。每個品項映射成 opaque merchant item ID，鍵為 seller_id、offer_id、product_id，數量由原 offer 決定；商家使用此映射重建成交條件，而非 catalog 原價。

更新 checkout 僅允许買家與配送資料；建立與 complete 均核對所有權、期限、庫存、價格、數量、交期、條款及配件授權。條件改變則 blocked，要求新 request，不改 accepted offer。

金額：現有整元 TWD 與 ACP minor units 分開型別；測試 adapter 固定 TWD exponent=2，NT$799 為 79900。整數運算；固定測試品項、稅與運費明細加總必須等於含稅運總額。正式 PSP 的 TWD 與付款憑證支援另行驗證。

### 4. 使用者確認與付款

ready 回應附簽名 confirmation_token，綁定 buyer、purchase、checkout revision、商品／金額／配送／條款摘要及 expires_at。token 有效期取簽發後五分鐘與原 offer expiry 的較早者。update 使舊 token 失效。明確按下「確認測試購買」才保存 confirmed_at 並允許 complete。

UI 不傳價格或 payment_data；server 生成限於本交易的測試 token，交給 ACP merchant simulator。正式 PSP adapter 預留 execute/query，未配置時 fail closed，不能改為模擬成功；也不能假定 PSP 任意 token 能跨商家使用。真實自有 UI 付款需另外接入商家認可的 PSP 憑證取得流程。

### 5. 持久化與恢復

Purchase 狀態：creating、needs_input、ready、submitting、reconciling、completed、canceled、expired、blocked。原 request 保持 accepted；訂單及付款結果另存。

新增下一個可用 migration，不占用其他工作的 004：purchases（UNIQUE request／decision）、purchase_operations（durable operation keys）、merchant_checkout_sessions、merchant_orders（UNIQUE checkout）、purchase_orders（UNIQUE purchase、seller+external_order）、commerce_outbox／inbox。PII 不進 LLM／日誌；付款及確認 token 原值不寫入通用 journal。journal 使用不可逆摘要比對、必要的非敏感恢復輸入與受保護的短期 secret reference。

先短交易保存 operation，再離開 SQLite 寫鎖做 HTTP，再短交易保存結果。商家模擬扣庫存、消耗付款 token、唯一訂單與 outbox 在同一交易內提交。測試 inventory 與議價 catalog 隔離。

發送後逾時不等於失敗。create 不明以原商家 key 找回 session；complete 不明先 GET，必要時以原 operation key 重送。worker 在重啟時恢復，退避 1、2、4、8、30 秒上限。結果未明時鎖住新 complete／update／cancel，不能建立第二張訂單。確定未付款且 merchant ready 時才允許重新確認的新 attempt。

回應或 authoritative 查詢必須是有效 completed 狀態、存在 order 且內容／session 一致，才保存 completed。原 offer 到期不阻止核對既有提交；已在期限內完成的訂單仍須恢復成功。終態不提供本輪重購，重新購買須新 request。

### 6. 事件與本地錯誤

商家 outbox 將固定 ACP schema 的事件發送到本地 `POST /api/integrations/acp/merchants/{seller_id}/events`；這是本專案接收端，不是 OpenAI endpoint。驗 raw body HMAC、時間窗及 seller scope，按事件摘要去重。事件觸發 GET 查詢，不直接信任通知改成完成；重送與亂序不能使終態倒退。

本地 API error envelope 沿用 error.code/message/fields，語意見 purchase spec。商家端保持固定 ACP schema 的錯誤與 HTTP 語意，不能直接輸出本地 envelope。

## Risks / Trade-offs

- ACP 已固定 2025-12-12 並通過本地契約與 HTTP 測試；不宣稱官方 conformance 認證或正式商家／PSP 相容性。
- 同程序測試無法代表外部 PSP：交付區分協定測試、模擬付款與真實交易證據。
- 商家交易與本地狀態沒有跨網路 ACID：operation journal、唯一約束及 authoritative reconciliation 保證可恢復，而非僅靠 disable button。
- 现有 config／DEVELOPMENT_RULES 的付款排除及歷史 redemption 路徑：本 change 記錄新範圍，實作提交再更新現況文件。

## Migration Plan

完成 ACP integration 與 purchase API 兩項 capability 與驗收；實作時依 tasks 的三批執行。先固定 contracts 與 SQLite，再接 ACP／PurchaseService，最後執行後端恢復測試；UI 接線另行交付。測試模式獨立開關且預設不啟用 live。正式上線需要另一個已確認商家、PSP、身分驗證與 credentials 的 change。


## Scope

本提交不包含前端實作、購買卡 UI 規格或視覺素材。自有 UI 為此 API 的預期呼叫端；此處僅定義後端確認、恢復及資料契約。
