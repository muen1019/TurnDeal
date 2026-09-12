## ADDED Requirements

### Requirement: Create a purchase from the saved acceptance
POST /api/requests/{request_id}/purchases SHALL 接受唯一 payload `{}`，禁止未知欄位，由 server 取得 buyer 的 accepted decision／selected_offer_id。首次建立回 201 PurchaseView，已存在回 200，商家結果未明回 202。每個 request／decision SHALL 最多一個 purchase；未 accept 回 409 offer_not_accepted。GET /api/requests/{request_id}/purchase SHALL 回 200 PurchaseView 或 404 not_found。

#### Scenario: Create from an accepted request
- **WHEN** buyer 使用新 Idempotency-Key 提交空物件至已接受的 request
- **THEN** server 綁定原 offer 並呼叫 ACP create，回傳 purchase_id 與可用 checkout 資料
- **AND** 前端不需要也不能指定價格、seller 或其他 offer

#### Scenario: All offers were skipped
- **WHEN** buyer 全部略過但沒有 accepted decision
- **THEN** create 回 409，不建立商家 session 或訂單

### Requirement: Update only buyer and fulfillment data
POST /api/purchases/{purchase_id}/checkout SHALL 接受以下 payload：buyer（name、email，phone_number optional）、fulfillment_address（name、line_one、city、state、country、postal_code，line_two／phone_number optional）、fulfillment_option_id。三個頂層欄位均 optional，但至少一項存在；提供的嵌套物件 SHALL 符合 purchase.v1 的完整必填欄位，由 adapter 映射至固定 ACP 2025-12-12 型別。未提供欄位保留原值；null／未知欄位拒絕 400 invalid_request。配送 ID SHALL 來自該 merchant session 的有效選項。

```json
{
  "buyer": {"name": "測試買家", "email": "buyer@example.com"},
  "fulfillment_address": {
    "name": "測試買家", "line_one": "測試路 123 號", "city": "Taipei",
    "state": "TW-TPE", "country": "TW", "postal_code": "100"
  },
  "fulfillment_option_id": "shipping_standard"
}
```

以上為測試範例，配送 ID 與地址可用性 SHALL 由 merchant 驗證。Update SHALL 呼叫 ACP update，返回 200 最新 PurchaseView 或 202 核對中；不得更新商品、數量、價格、offer、provider 或 endpoint。

#### Scenario: Fill in checkout details
- **WHEN** buyer 提交有效地址與商家提供的配送選項
- **THEN** backend 更新 ACP cart、核對原條件並增加 checkout_revision，舊確認 token 失效

#### Scenario: Attempt price or item modification
- **WHEN** payload 包含 total_price_twd、items、offer_id、payment_data 或未知欄位
- **THEN** 回 400 invalid_request，商家不收到修改請求

### Requirement: Define a recoverable purchase response
所有購買資源回應 SHALL 使用 PurchaseView，包含 purchase_id、request_id、offer_id、seller_id、mode=test、payment_execution=simulated、status、checkout_session_id（未取得時 null）、checkout_revision、expires_at、offer（引用既有 Offer）、checkout（未取得時 null）、order（未完成時 null）、error（無錯誤時 null）、allowed_actions。Checkout SHALL 包含 currency、amount_minor、total_price_twd、line_items、buyer、fulfillment_address、fulfillment_options、fulfillment_option_id、terms；缺少資料以明確 null／空陣列表達，不虛構 ready。

Ready 回應 SHALL 額外提供 confirmation_token 與 confirmation_expires_at，其他狀態不提供。Order SHALL 包含 order_id、merchant_order_id、checkout_session_id、created_at、total_price_twd、payment_status=simulated_succeeded。新 schema SHALL 明確定義完整型別，不將 ACP wire fields 或自訂狀態混入 RequestSnapshot。GET /api/purchases/{purchase_id} SHALL 返回此 envelope，結果未明時可排入去重核對工作，但不能建立新購買。

#### Scenario: Read after reloading
- **WHEN** buyer 重新整理並依 request 查詢 purchase
- **THEN** 回應包含既有 purchase／session／order，UI 可恢復，不依賴 sessionStorage 推定交易結果

### Requirement: Complete only an explicitly confirmed checkout
POST /api/purchases/{purchase_id}/complete SHALL 只接受 `{ "confirmation_token": "<server-issued-token>" }`；token 為非空字串且不允許其他欄位。Server SHALL 驗證 token 簽章、buyer、purchase、revision、完整摘要與期限；只有 ready 且使用者明確確認時才保存 confirmed_at、轉 submitting、呼叫 ACP complete。成功回 200 PurchaseView；提交中或結果不明回 202。token 原值 MUST NOT 進 journal／日誌。取得 token 本身不視為已確認。

#### Scenario: Confirm the displayed checkout
- **WHEN** buyer 按確認並提交對應已顯示摘要的有效 token
- **THEN** server 重新核對原 offer 與 cart，生成 server-side 測試付款憑證並透過 ACP complete 執行

#### Scenario: Use an old confirmation
- **WHEN** checkout 更新後提交舊 token
- **THEN** 回 409 checkout_changed 並要求重新顯示及確認，不發送付款

### Requirement: Revalidate immutable terms at purchase boundaries
建立與 complete 前 SHALL 核對 ownership、accepted offer、期限、庫存、商品與數量、價格、配送、條款、配件授權。前端／LLM 資料 MUST NOT 取代原 offer。條件改變 SHALL 阻止完成且不變更 accept。確定過期且無未明提交可標 expired，其他不可履約條件可標 blocked；重新購買須新 request。

#### Scenario: Merchant changes a term
- **WHEN** ACP 回應總價相同但商品被替換、交期變長或條款不同
- **THEN** purchase 被阻止，不能只因總價吻合就付款

#### Scenario: Previously submitted order completes before expiry
- **WHEN** complete 回應丟失，核對時 offer 已過期但 merchant 已在期限內完成
- **THEN** 恢復原 completed 訂單，不錯誤要求重購

### Requirement: Isolate buyers and define API errors
所有資源 SHALL 依 server 驗證的 buyer 隔離，未驗證回 401 authentication_required，其他 buyer 的資源回 404 not_found。所有 POST SHALL 要求 1–128 字元 Idempotency-Key；JSON、key 或未知欄位錯誤回 400 invalid_request。Error SHALL 使用 `{ "error": { "code": "...", "message": "...", "fields": [] } }`；PurchaseView.error 使用同一 error 物件或 null。

409 codes SHALL 包含 offer_not_accepted、checkout_changed、offer_changed、inventory_unavailable、idempotency_conflict、purchase_in_progress、state_conflict；410 offer_expired；422 checkout_incomplete／payment_declined；502 invalid_acp_response；503 live_checkout_not_configured。已送出的 complete 其回應壞資料或連線錯誤 SHALL 回 202 PurchaseView(status=reconciling)，不能當成確定未付款的 502／422。

#### Scenario: Access another buyer's purchase
- **WHEN** buyer 猜測其他人的 purchase ID
- **THEN** GET 與 POST 都回 404，不暴露訂單或配送資訊

### Requirement: Preserve idempotency across concurrency and restarts
Server SHALL 按 buyer、method、path、key 與輸入摘要重播原回應；同 key 不同 body 回 409。202 重播保持原回應，最新狀態由 GET 查詢。不同 key 的同一 request SHALL 仍受唯一 purchase、提交鎖及唯一 order 約束。外部操作 SHALL 先以短交易保存 durable key，再做 HTTP；不得持有 SQLite 寫鎖等待外部服務。

#### Scenario: Concurrent completion with different keys
- **WHEN** 兩個分頁以不同 key 同時 complete
- **THEN** 至多一個有效付款操作；另一個回既有訂單或處理中結果，不能再扣庫存

#### Scenario: Crash after merchant committed
- **WHEN** merchant 已建立訂單但 client 在保存結果前重啟
- **THEN** worker 以原 session／operation key 核對並恢復同一訂單，不發起第二筆付款

### Requirement: Resolve unknown outcomes before retrying payment
系統 SHALL 保存 creating／needs_input／ready／submitting／reconciling／completed／canceled／expired／blocked 狀態。發送後不明結果 SHALL 進 reconciling，阻止新 complete、update、cancel。Create 可原 key 重送找回 session；complete SHALL 先 GET，必要時沿用原 key 重送。只有確定未成功且商家仍 ready 才允许重新確認新 attempt。Completed SHALL 需要通過 schema 及 offer 核對的 merchant completed 與一致 order。

#### Scenario: Merchant cannot be reached
- **WHEN** 多次核對仍然逾時
- **THEN** 保持 reconciling，展示核對資訊，不宣稱付款失敗或提供重新購買

### Requirement: Cancel without mutating accepted decisions
POST /api/purchases/{purchase_id}/cancel SHALL 接受 `{}`，僅在有已知 session 且未提交完成時呼叫 ACP cancel。成功回 200 canceled；已 canceled 回同一結果；completed 回 409 state_conflict；處理中／結果不明回 409 purchase_in_progress。取消請求已送出但結果不明回 202 reconciling。沒有可取消 session 且尚在 creating 時回 409 purchase_in_progress。原 request SHALL 保持 accepted，舊 decision／snapshot／receipt 不改寫。

#### Scenario: Cancel after acceptance
- **WHEN** buyer 取消尚未提交的 checkout
- **THEN** merchant session canceled，沒有訂單或付款，原 accept decision 仍可查閱
