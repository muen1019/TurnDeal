# ACP 購買 API 設計草案

日期：2026-09-12。狀態：後端測試交易已實作並驗證；前端實作及 UI 規格不納入本提交，正式付款未實作。現行契約以 OpenSpec 與 docs/ACP_PURCHASE.md 為準。

使用者已確認第一版範圍：完成 ACP 測試交易與訂單流程，保留正式付款串接。

## 1. 現況與目標

現行完整應用使用 `backend/runtime/app.mjs`、`backend/runtime/store.mjs`。Accept 只保存 decision 與 selected_offer_id；`frontend/src/App.tsx` 顯示 DecisionSummary，不執行購買。Skip 僅更新本地 skipped 清單，全部略過轉到 feedback。每個 request 只能接受一個 offer；一個 offer 可含主商品與已授權配件。

本次設計新增：accept → checkout → 使用者確認購買 → ACP complete → 測試訂單與收據。所有交易都必須經過 ACP HTTP 邊界及契約驗證，不能直接把 request 改成「已購買」。第一版不扣款、不出貨、不接收真實卡號。

`docs/DEVELOPMENT_RULES.md` 現有「ACP 不在本版範圍」是此前範圍；本草案依使用者新需求提出擴充。它也仍列有尚未接線的 redemption endpoint。實作時同步修正文檔的現況／目標描述，本文件不宣稱那些端點已存在。

## 2. 官方依據與角色

ACP 的 Checkout 規格由商家提供結帳 REST 介面；OpenAI 的 ChatGPT 流程呼叫商家，交易金流留在商家與 PSP。公開協定可自行實作；ChatGPT Instant Checkout 的正式整合仍有合作夥伴准入要求。見 [OpenAI Agentic Checkout Spec](https://developers.openai.com/commerce/specs/checkout)。

本專案第一版由 OfferMesh 扮演 ACP client，A–E 虛擬賣家共用一個具商家隔離的測試服務。這是自建 ACP 測試環境，不是 OpenAI 託管 sandbox，也不代表已通過 OpenAI 認證或接入 ChatGPT Instant Checkout。

付款執行器第一版為本地 simulator。之後可替換為商家 PSP adapter；Delegated Payment 涉及受限制的支付憑證與 PSP，不是一般 OpenAI API key 可以直接發起的扣款服務。見 [OpenAI Delegated Payment Spec](https://developers.openai.com/commerce/specs/payment)。

實作採固定 ACP 2025-12-12，commit、來源與 SHA-256 保存於 contracts/acp/manifest.json。UI payload 由 adapter 映射至該版本 wire schema，不浮動追蹤 main；完整映射及驗證見 docs/ACP_PURCHASE.md。

## 3. 方案比較與選擇

| 方案 | 優點 | 代價與限制 |
| --- | --- | --- |
| **建議：獨立 ACP client + 本地商家測試端** | 可驗證真正 HTTP 往返、協定資料與恢復流程；適合目前虛擬市場 | 必須實作測試商家與付款 simulator |
| 一开始即接商家 ACP 與 PSP 測試帳號 | 更接近該商家的真實交易 | 依賴商家資格、端點、帳號及幣別支援，現階段尚未確認 |
| 僅在現行 accept handler 後直接寫訂單 | 開發最少 | 沒有 ACP 交易交換，不符合本次要求，排除 |

採用第一個方案。單一 Node backend 與 SQLite 即可承載兩側模組，不新增 Redis 或獨立部署微服務。即使同一程序，測試購買也必須透過 HTTP 呼叫商家 router，不能用函式直呼繞過 ACP。

## 4. 元件與使用者流程

- `PurchaseService`：驗證 buyer、accepted offer、確認紀錄，維護購買狀態與恢復工作。
- `AcpClient`：依已設定的 seller endpoint、merchant credentials、固定協定版本發送請求，驗證回應並映射錯誤。
- `AcpTestMerchant`：實作 ACP checkout lifecycle、報價綁定、測試庫存與訂單。
- `PaymentExecutor`：提供付款執行及狀態查詢界面；第一版只有 simulator，正式 adapter 預設不可用。
- SQLite operation journal 與 outbox：保存外部操作識別與訂單事件，程序重啟後繼續核對。

Accept 成功後顯示「前往結帳」，以原 selected_offer_id 建立 checkout。畫面列出完整商品、總額、配送與條款，補齊測試買家資料，再提供「確認測試購買」。該按鈕才呼叫 complete；LLM 推薦、accept 或 skip 均不能代替此確認。成功顯示「測試訂單完成，未實際扣款」。

Skip 行為不變。全部略過沒有 accepted offer，不建立 checkout。結帳失敗不撤銷或改寫原 accept 紀錄。

## 5. OfferMesh 對前端 API（本專案自訂，非 ACP 標準端點）

所有資源依已驗證 buyer 隔離，buyer 身分不採信 request body。所有 POST 要求 `Idempotency-Key`（1–128 字元）。測試使用既有 demo buyer；正式模式必須改接真正的身分驗證。

| 方法與路徑 | 輸入／行為 | 回應 |
| --- | --- | --- |
| `POST /api/requests/{request_id}/purchases` | body 為 `{}`；伺服器讀取唯一 accepted offer，建立或取得本輪 purchase 與 ACP session | 首次建立 201；已存在回 200；外部結果未明回 202 |
| `GET /api/requests/{request_id}/purchase` | 依 request 找回 purchase；供重整頁面恢復 | 200 PurchaseView；尚未建立 404 |
| `GET /api/purchases/{purchase_id}` | 查詢已保存狀態，結果不明時排入去重核對工作 | 200 PurchaseView |
| `POST /api/purchases/{purchase_id}/checkout` | 更新 buyer、fulfillment_address、fulfillment_option_id；禁止改 offer、商品、數量或價格 | 200 最新 PurchaseView；外部結果未明回 202 |
| `POST /api/purchases/{purchase_id}/complete` | 提交伺服器簽發的 confirmation_token，執行測試購買 | 200 完成結果；處理中／結果不明回 202 |
| `POST /api/purchases/{purchase_id}/cancel` | 取消尚未完成的 checkout；不能當作已完成訂單退款 | 200 已取消；完成或已在提交中回 409；外部結果未明回 202 |

`PurchaseView` 包含 purchase_id、request_id、offer_id、seller_id、mode、payment_execution、status、checkout_session_id、checkout_revision、expires_at、商品、價格、配送、條款、order、error 與 allowed_actions。`mode` 固定 `test`，`payment_execution` 固定 `simulated`。它是本專案 envelope，不能把這些自訂欄位或狀態塞進 ACP 標準物件。

只有 ready 狀態回傳 confirmation_token。Token 由伺服器簽發，綁定 buyer、purchase、checkout revision、完整商品／總價／配送／條款摘要與到期時間。畫面以對應 revision 顯示摘要；使用者按確認後提交 token。更新 checkout 即撤銷舊 token。Token 代表已顯示的可確認內容，單純取得 token 並不視為使用者已授權購買；complete 的明確操作才保存 confirmed_at。

前端不得提交付款金額、seller URL、商家 credentials、PSP provider 或任意付款 token。Simulator 所需測試憑證由伺服器建立，綁定交易與額度，只能使用一次。其摘要可保存用於去重，原值不得進日誌或通用 idempotency payload。

## 6. ACP 商家端映射

以經設定的每商家 base URL 為根提供五個路徑：

| ACP 路徑 | 本專案用途 |
| --- | --- |
| `POST /checkout_sessions` | 以本次報價綁定的 merchant item IDs 建立結帳 |
| `POST /checkout_sessions/{id}` | 更新買家及配送資料 |
| `GET /checkout_sessions/{id}` | 恢復與核對 authoritative cart／order |
| `POST /checkout_sessions/{id}/complete` | 傳遞 payment_data 並完成訂單 |
| `POST /checkout_sessions/{id}/cancel` | 取消尚未完成的結帳 |

路徑、訊息結構及驗證以固定的 [ACP Checkout 規格](https://developers.openai.com/commerce/specs/checkout) 為準。商家端保留原規格 HTTP 語意；OfferMesh API 可將其映射為自訂錯誤，但不能修改 wire contract。

商家 item ID 由伺服器建立映射 `(seller_id, offer_id, product_id) → opaque merchant_item_id`，並保存原商品數量、成交價分配、条款及期限。商家端按此映射回算成交報價，禁止退回 catalog 原價，也不將未經約定的 offer_id 自訂欄位加入 ACP body。A–E 各自 credentials 只能存取自己的映射、checkout 與 order。

選用 stripe 型別的協定測試 fixture 驗證 payment_data wire shape，但由 simulator 處理，並非有效 Stripe Shared Payment Token；UI 與 evidence 必須標示 simulated。不得偽造「OpenAI 已授權」標記或使用 ChatGPT 身分識別冒充官方呼叫。

適配器只連向設定 allowlist；HTTPS 用於公開端點，本地 loopback HTTP 僅供開發測試。商家憑證與簽章金鑰在伺服器設定，前端及 LLM 均不接觸。請求 header、版本、簽章與 timestamp 驗證納入契約測試；本地自定義測試簽章不能宣稱是正式 OpenAI 驗證。

## 7. 不可變報價與金額

建立 checkout 與 complete 前都重新核對 owner、accepted offer、期限、可用庫存、商品與數量、總額、交期、配件授權及條款。更新地址後若不能以原條件履約，該 purchase 進入 blocked，要求重新取得方案；不偷偷修改 accepted offer，也不允許以較高價格直接購買。

現有 `total_price_twd` 是整元且含稅運。ACP 金額使用整數 minor units；adapter 的 TWD 測試規則明確採 exponent 2，例如 NT$799 ↔ 79900，禁止浮點計算及直接搬用 799。這是本專案的幣別轉換規則；正式 PSP 的 TWD 能力與換算須在接入時獨立驗證。ACP 金額單位依據見 [Checkout totals](https://developers.openai.com/commerce/specs/checkout)。

測試報價附固定、可重現的品項／稅／運費分配，分項加總必須等於原含稅運費總額。主商品與配件分別呈現，零元贈品仍須保留。測試稅費不是台灣稅務計算服務；正式接線需要商家提供實際明細與可履約配送選項。

完整 checkout 內容與 accepted offer 必須相符；不可只比對 total 後接受被替換的商品。過期檢查不可因重試就延長原報價期限。

## 8. 狀態與持久化

RequestSnapshot 保留 `accepted` 作為議價決策終態。購買狀態透過獨立 API 取得，不擴張現有 Status enum，也不把 ACP 訂單偽裝成舊 RedemptionReceipt。付款結果與物流狀態分開儲存。

本地 purchase 狀態：`creating`、`needs_input`、`ready`、`submitting`、`reconciling`、`completed`、`canceled`、`expired`、`blocked`。

- ACP not_ready_for_payment 對應 needs_input；ready_for_payment 須通過本地報價核對後才對應 ready。
- complete 開始先持久化 submitting。逾時、斷線或程序重啟後未取得確定結果進 reconciling，禁止建立第二筆付款。
- completed 必須同時取得有效 ACP completed 回應／查詢結果及一致的 order ID、session、商品與金額；單純 HTTP 200 不代表成功。
- 已確定付款拒絕且商家仍為 ready 可重新取得確認 token 後重試；新 attempt 只允許在前一 attempt 確定未成功時建立。
- confirmed submitting 期間的 update／cancel 互斥。結果未明時即使原 offer 過期仍要先核對；若商家已於有效期限內成交，恢復 completed，不能誤判 expired 後再次購買。
- completed、canceled、expired、blocked 為第一版終態；取消或失效後要購買須開始新 request，避免隱含重新授權。

在下一個可用 migration 新增（不占用目前未提交的 004）：

| 資料表 | 主要責任與約束 |
| --- | --- |
| purchases | UNIQUE request_id／decision_id，綁定 user、offer、seller、模式、原報價摘要、session、revision 與狀態 |
| purchase_operations | 每次 create／update／complete／cancel 的 durable key、輸入摘要、狀態、回應與恢復時間；不存卡號或原始 token |
| merchant_checkout_sessions | 商家側隔離 session，綁定報價映射、買家 context、配送與狀態 |
| merchant_orders | UNIQUE checkout_session_id，訂單與付款模擬結果；外部 order ID 以 merchant 為命名空間 |
| purchase_orders | OfferMesh 的核對結果，UNIQUE purchase_id、UNIQUE (seller_id, external_order_id) |
| commerce_outbox | 商家訂單事件與重試狀態 |
| commerce_inbox | 事件去重與驗章結果，處理重送／亂序，不讓完成狀態倒退 |

測試商家使用交易專屬 fixture inventory；不消耗可重現議價 catalog 的庫存。完成時在同一 SQLite transaction 以條件更新扣減測試庫存、消耗測試憑證、建立唯一訂單及 outbox。若庫存不足整批回滾。商家與 buyer 模組雖共用 SQLite 檔案，buyer 的完成判斷仍只能來自 ACP 回應／核對，不能讀商家表直接判定成功。

## 9. 冪等、恢復與事件

先在短 SQLite transaction 建立 operation，再離開交易做 HTTP，最後以短交易保存結果；不得在 SQLite 寫入鎖內等待網路。不同 browser tab、不同 idempotency key 的同一 request 仍受唯一 purchase 與同一提交鎖約束。

重送同一 buyer、method、path、key 與相同輸入重播原結果；同 key 不同輸入回 409。已重播的 202 保持原回應，前端透過 GET 查新狀態。已完成 purchase 用新 key complete 仍回同一訂單，不產生新付款。

對商家與 PSP 的重試沿用同一 durable operation key。Create 回應丟失時重送原 create key 找回同一 session；complete 回應丟失時先 GET 核對，再按商家冪等保證重送原 operation。恢復 worker 啟動時掃描未完成操作，延遲採 1、2、4、8、30 秒上限；不確定結果不得轉成「可重新付款」。永久失聯保持 reconciling 並提供查詢／人工核對資訊。

測試商家發送 ACP 訂單事件至本地 `POST /api/integrations/acp/merchants/{seller_id}/events`，此路徑是 OfferMesh 接收端，並非 OpenAI 官方 webhook。以每商家測試金鑰驗證原始 body 簽章，防止跨商家注入；重送用事件摘要去重。事件只觸發 GET 核對 authoritative session，不能單憑未核對事件宣告交易完成。商家保存 outbox，非 2xx 回應依退避重送。

官方 Checkout 頁面概述與物件表的事件命名存在不同寫法；實作只依固定 schema 選用一組 wire enum，並以契約測試鎖定，不能同時猜測接受多種寫法。

## 10. 錯誤與前端行為

| 本地 HTTP / code | 行為 |
| --- | --- |
| 401 / authentication_required | 要求有效身分 |
| 404 / not_found | 資源不存在或不屬於 buyer，不洩漏他人訂單 |
| 409 / offer_not_accepted | 仍未 accept 或 request 不可交易 |
| 409 / checkout_changed | 確認版本失效，重新顯示最新摘要 |
| 409 / offer_changed、inventory_unavailable | 阻止完成，不替換或加價 |
| 409 / idempotency_conflict、purchase_in_progress | 保留原操作，查詢既有結果 |
| 410 / offer_expired | 新交易已過期；結果未明的既有交易仍須核對 |
| 422 / checkout_incomplete、payment_declined | 補資料或在確定未成功後重新確認 |
| 202 / reconciling | 顯示「正在核對交易，請勿重複購買」；不是付款失敗 |
| 502 / invalid_acp_response | 阻止接受壞資料；若 complete 已送出則以 202 保留核對狀態 |
| 503 / live_checkout_not_configured | 正式模式未配置時明確失敗，不能偷偷改用模擬成功 |

API 的 complete 要求有效確認憑證，GET 提供訂單恢復；前端行為另行交付。

## 11. 實作範圍與正式串接邊界

先新增 purchase 契約與 OpenAPI，採獨立 `contracts/purchase.v1.schema.json` 並引用既有 Offer 型別；前端 API 路徑與型別透過產生器更新，不能直接改 generated files。ACP vendor schema 與內部 PurchaseView 是兩個不同邊界。

核心接線位於 backend/runtime，新增 purchase 與 acp 模組。現有 `backend/src` legacy Result server 及使用者的 improver 未提交變更不納入本次修改。前端接線不在本提交內。設計審閱後實作時，再同步 README、RUN_FULL_APP、DEVELOPMENT_RULES 及必要的 AGENTS 路由／契約指引。

正式 adapter 預留 create/get/update/complete/cancel 與 payment execute/query 能力，但第一版 live 啟動必須失敗。未來啟用前需要真实商家 ACP endpoint／憑證、固定協定版本、PSP 合作與付款憑證來源、TWD 及配送支援、正式身分驗證、簽章設定及付款／訂單恢復驗證。若要在 ChatGPT 中販售，另需官方 Instant Checkout 接入資格。外部 app 的測試不能證明上述能力已開通。

## 12. 驗收（實跑結果見 docs/ACP_PURCHASE_TEST_REPORT.md）

1. 成功流程：建立真實 request、accept、經 HTTP ACP create/update/complete/get，產生一張持久化測試訂單；重新啟動仍讀到同一張收據。
2. 授權：未 accept、全部 skip、跨 buyer／seller、篡改 offer／quantity、缺少確認、過期 confirmation token 均不能成交。
3. 報價：過期、缺貨、價格／商品／配送／條款變更、未授權配件均阻止 complete；NT$799 與 79900 minor units、零元贈品及分項總和有固定測試。
4. 重複：同 key 重送、不同 key 並行 complete、兩分頁同時按鈕，只建立一張訂單且只消耗一次付款憑證與庫存。
5. 不明結果：商家完成後丟失回應、create 丟失回應、提交後重啟、完成後才過期，均恢复同一 session／order；不能要求重新支付。
6. 事件：合法、偽造、跨商家、重送與亂序 webhook；完成狀態不能倒退，事件先到或 HTTP 先到結果一致。
7. 協定：固定版本請求／回應 schema、五個路徑、headers、錯誤、商家身分隔離與簽章驗證；malformed completed response 不得被当成成功。
8. API 模式：測試回應明示 test／simulated，拒絕 live fallback；不納入 UI 驗收。

交付證據包括固定協定來源與雜湊、測試輸出、脱敏 HTTP trace、唯一 order／operation 的資料庫核對；有 simulator 測試通過不能寫成實際付款或 OpenAI 認證通過。
