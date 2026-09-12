## ADDED Requirements

### Requirement: Use ACP from the application backend
系統 SHALL 由 backend 作為 ACP client 呼叫商家，提供自有應用可用的購買 API；第一版 SHALL 使用自建 A–E 商家測試端與模擬付款。系統 MUST NOT 把一般 OpenAI API key 當作商家憑證，或宣稱測試交易經由 OpenAI 託管付款、ChatGPT Instant Checkout 或取得官方認證。

#### Scenario: Complete a purchase without ChatGPT
- **WHEN** 呼叫端提交有效購買確認至 OfferMesh API
- **THEN** backend 透過 ACP HTTP 商家端完成測試訂單，使用者不須進入 ChatGPT
- **AND** 結果標示 test／simulated，不能標示真實付款

### Requirement: Pin and validate the ACP wire contract
實作 SHALL 固定 ACP schema 的來源、版本與 hash，並對所有請求／回應驗證。Client 與 merchant SHALL 使用同一版本，認證、冪等、追蹤與簽章 header 依該版本及明確的本地測試設定提供。未知 enum 或不一致 schema MUST NOT 默默接受。本地測試 HMAC SHALL 與正式 OpenAI 驗證能力區別。

#### Scenario: Receive an invalid completion response
- **WHEN** 商家 complete 回傳 HTTP 200 但缺少必要欄位、未知狀態或不符合固定 schema
- **THEN** client 不標記 completed；已送出的交易進入核對程序

#### Scenario: Protocol sources disagree
- **WHEN** 文件與機器 schema 對版本或事件 enum 不一致
- **THEN** 在差異被確認並固定單一契約前，不宣稱 ACP 相容或開始正式接線

### Requirement: Implement merchant checkout operations over HTTP
測試 merchant SHALL 提供 POST /checkout_sessions、POST /checkout_sessions/{id}、GET /checkout_sessions/{id}、POST /checkout_sessions/{id}/complete、POST /checkout_sessions/{id}/cancel。Client MUST 實際跨 HTTP 邊界，不得直讀商家資料庫取代回應。商家所有狀態與 HTTP response SHALL 遵循固定 ACP contract，包括完整 cart state。公開端點 SHALL 使用 HTTPS；HTTP 僅允許本地 loopback 測試。

固定版本 SHALL 為上游 commit `7fdd78df677a94dce04c770644b0fbbb1401272b` 的 2025-12-12；來源及 SHA-256 保存於 contracts/acp/manifest.json。Create payload SHALL 為 items 陣列，每項含 id 與正整數 quantity，可帶該版規格允許的 buyer／fulfillment_details。Update SHALL 使用 buyer（first_name、last_name、email）、fulfillment_details.address 與 selected_fulfillment_options（shipping.option_id、shipping.item_ids）。本地 API 的 name／fulfillment_address／fulfillment_option_id SHALL 由 adapter 映射，不直接當作 ACP 欄位。Complete SHALL 傳 payment_data，包含商家認可的 provider 與 token；不得把 OfferMesh 自訂 confirmation_token 或 mode 放入 ACP body。Webhook enum SHALL 使用固定 webhook OpenAPI 的 order_create／order_update。

#### Scenario: Exercise the full merchant lifecycle
- **WHEN** client 依序 create、update、complete、get
- **THEN** HTTP trace 顯示對應路徑及有效 ACP payload，且 get 返回同一 checkout 與完成訂單

#### Scenario: Cancel an unfinished checkout
- **WHEN** client 取消可取消的 checkout
- **THEN** merchant 依固定契約回應 canceled；已完成的訂單不能透過 cancel 當作退款

### Requirement: Bind merchant items to immutable negotiated offers
Backend SHALL 以 (seller_id, offer_id, product_id) 映射 merchant item ID，並保存 buyer scope、原品項、數量、價格、配送、條款與期限。Merchant SHALL 從可信映射還原報價，不依 client 傳入價格或以 catalog 原價取代議價。Endpoint／credentials SHALL 由 server allowlist 設定，各 seller 資源隔離。

#### Scenario: Purchase a negotiated bundle
- **WHEN** accepted offer 含滑鼠與已授權零元滑鼠墊
- **THEN** ACP checkout 保留兩個品項及原成交总額，不移除贈品或增加費用

#### Scenario: Attempt another seller or endpoint
- **WHEN** client 提交其他 seller 的 item／session 或使用者提供外部 endpoint
- **THEN** 系統拒絕存取且不向該 URL 傳送憑證

### Requirement: Convert currency without changing the accepted price
Adapter SHALL 使用整數金額及明確的 currency exponent；TWD 測試採 exponent 2，原 NT$799 SHALL 映射為 79900 minor units。商品、稅、運費的測試明細 SHALL 加總為原含稅運總額。正式 PSP 的幣別支援 MUST 另行確認。

#### Scenario: Validate currency and breakdown
- **WHEN** merchant 回傳 TWD 金額、零元贈品及稅運明細
- **THEN** adapter 核對幣別、換算、分項總和、原 offer 商品與總額；不一致即阻止付款

### Requirement: Separate simulated and live payment execution
第一版 PaymentExecutor SHALL 僅接受伺服器簽發、綁定交易／商家／額度／期限、單次使用的測試憑證；不得接收真實卡號。採用 stripe wire fixture MUST 明示不是有效 Stripe／OpenAI token。正式 adapter SHALL 預留 execute/query；未配置 live 時 SHALL 明確拒絕，不回退成模擬成功。正式自有 UI 付款憑證來源 SHALL 另行與商家 PSP 整合，不假定可以取得 ChatGPT 已存支付資料。

#### Scenario: Enable live without merchant payment integration
- **WHEN** 啟用 live 但沒有支援的商家／PSP 憑證與設定
- **THEN** 系統回 live_checkout_not_configured，不建立模擬成功訂單

#### Scenario: Replay a test payment token
- **WHEN** 同一測試付款 token 被第二個交易使用
- **THEN** merchant 拒絕；原交易的冪等重送則返回原結果，不再次消耗 token

### Requirement: Reconcile signed merchant events
Merchant SHALL 持久化 outbox 並發送固定 ACP schema 的訂單事件至本地 /api/integrations/acp/merchants/{seller_id}/events。接收端 SHALL 驗證 raw body 簽章、timestamp、seller scope，去重後透過 ACP GET 核對，不單凭事件宣告完成。此端點 MUST 明示是 OfferMesh 自建接收端。

#### Scenario: Receive duplicate or out of order events
- **WHEN** 合法事件重送或舊事件晚於完成事件到達
- **THEN** GET 核對同一 authoritative session，訂單不重建、completed 不倒退

#### Scenario: Receive an unauthenticated merchant event
- **WHEN** 簽章錯誤、時間窗過期或 seller 不符
- **THEN** 接收端拒絕事件且不修改 purchase 狀態
