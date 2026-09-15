# TurnDeal 系統架構

TurnDeal 是以 Buyer 為中心的多 Seller 商務協商展示。完整流程由 Node 24 runtime 編排；核心路徑可完全離線執行，啟用模型後仍由 Backend 驗證所有商務結果。

## 架構

```text
React UI
   │  POST request / GET snapshot / POST decision
   ▼
Integrated Runtime API
   ├─ Formatter ─────── intent + request-bound preference snapshot
   ├─ Discovery ─────── catalog filtering and natural ranking
   ├─ Orchestrator ──── one private Buyer branch per eligible Seller
   ├─ Negotiation ───── synchronized rounds, isolated Seller policies
   ├─ Offer Validator ─ inventory, price, delivery, terms, add-on permission
   ├─ Evaluator ─────── ranking of the complete eligible Offer set
   ├─ Improver ─────── optional feedback revision workflow
   └─ Purchase ─────── ACP test checkout and simulated payment
             │
             ▼
        SQLite data/app.sqlite
```

## Runtime 邊界

| 元件 | 責任 | 不負責 |
| --- | --- | --- |
| Frontend | Buyer 設定、輸入、問答、狀態輪詢、Offer 決策、Improver 與測試結帳 | 保存權威狀態、排名、付款或商務驗證 |
| Formatter | 合併本輪文件與固定偏好來源，產生可驗證的 `NormalizedIntent` | 更新長期偏好、捏造缺少的硬限制 |
| Discovery | 硬條件篩選、公開資料評分、自然排名與 Sponsored display selection | 議價、使用私有底價排名 |
| Orchestrator | 凍結需求／Catalog 來源、選擇合格 Seller、建立隔離分支 | 把完整 Backend context 傳給 Seller |
| Negotiation | 每家最多五輪、同步 barrier、私有政策與可恢復歷史 | 建立正式 Offer ID 或自行放寬限制 |
| Backend validator | 建立 Offer、驗證資格、發布不可變快照 | 相信 Seller 或模型的成功宣告 |
| Evaluator | 對完整 eligible ID 集合提供獨立排序與理由 | 接收 Campaign、排序不合格方案 |
| Improver | 保存回饋、產生受驗證的文件 revision／澄清 | 改寫既有 Request、從左滑自動學習偏好 |
| Purchase | accepted Offer 的 ACP 測試 checkout、冪等恢復與模擬完成 | 真實扣款、退款、出貨或正式商家 conformance |

完整應用位於 `backend/runtime/`。它使用 Node 24 的 `node:sqlite` 與 `data/app.sqlite`。位於 `backend/src/` 的 Node 20 server 是 legacy Result 相容測試路徑，不是完整展示入口。

## Request 與文件

`intent_md` 是本次交易文字；CreateRequest 的 `preference_md` 是本次固定輸入快照。Buyer profile／versioned preference 只能由明示設定或受驗證的 Improver patch 更新。Formatter 依本輪 intent、該快照及固定的 SQLite preference binding 產生 `NormalizedIntent`，但不自行學習。詳細優先順序見 [文件語意](INTENT_PREFERENCE_SPEC.md)。

Request 發布後，原文、Formatter result、Discovery snapshot、Orchestration plan、每輪 commit、Offer、Evaluator result 與 decision 都以 request／revision 關聯。晚到或重送結果不得覆蓋終態。

## Discovery 與 Sponsored

Discovery 先排除不支援類別、缺貨與明確硬限制不符項目，再依價格目標、偏好、評分、交期及已驗證售後條件計分。每個 Seller 最多保留一個自然排名候選，最多取五家。

替代方案可顯示違反原因，但不能自動進入議價。Campaign 只會在自然入選且合格的 Seller 中選擇 Sponsored 標示，不改分數、順序或分支數。

## 私有多分支議價

每個 Seller 有獨立 Buyer branch，並只收到自己的 RFQ、公開商品條件、自己的歷史和私有政策。Backend 可以分享上一個已提交輪次中經驗證、去識別化的可比較條件，但不分享其他 Seller 的身分、Offer ID、逐字稿、底價、政策、Campaign 或 trust data。

所有 active branch 同輪平行，輪間同步。完成、拒絕、逾時或錯誤的 branch 不再進入下一輪；其他 branch 可繼續至各自停止條件或第五輪。模型輸出越界時使用固定 fallback 或拒絕，不重試到突破成本與時間上限。

## Offer 與 Evaluator

Seller 回傳的只是草稿。Backend 重新檢查：

- Seller／SKU 歸屬、庫存與數量；
- 含稅運整數總價、底價、成本與讓利預算；
- 到貨時間、條款與有效期限；
- 配件關聯性、庫存，以及免費／付費授權；
- 公開權益的 scope、條件與模擬履約證據。

Backend 為合法版本建立不可變 Offer ID。Evaluator 輸入不含 Campaign 或私有 Seller policy，且 ID 集合必須精確等於當下全部 eligible Offers。模型回傳後再次驗證集合與資格，失敗時使用 deterministic fallback。

## 決策、改善與購買

採用或拒絕使用獨立 decision 欄位，不修改已發布 snapshot。採用時重新驗證同一 Offer；拒絕保存原始 feedback 與 source documents。

`selection_version: 1` 可把已拒絕 ID 集合交給 Improver。Improver 的 revision 與工作狀態獨立保存，不改寫父 Request 或已採用 Offer。只有明確且受支援的長期表述才可能建立 preference patch；child 使用提交時凍結的文件、權重與模型。

採用不會自動購買。Frontend 只會為已接受且重新驗證成功的 Offer 呼叫 Purchase API 建立 ACP test checkout；使用者還需檢查資料並提交 confirmation token 才完成模擬訂單。

Desktop runtime 使用持久化 `data/app.sqlite`。Mobile preview／paired live mode 使用獨立 runtime 與每個瀏覽器的 demo buyer；它不是正式帳號或跨裝置資料同步。

## 持久化與恢復

`db/migrations/` 是資料庫 schema 正本。啟動只套用缺少的 migration／versioned seed，不重建歷史價格、庫存或快照。同一資料庫只能有一個 writer。

網路與模型呼叫不持有 SQLite transaction。已完成的 idempotent 操作重播原結果；執行中斷依各模組規則標記失敗或由既有 durable job 恢復，不能盲目重送可能有副作用的操作。

## 契約

- Active commerce contract：`contracts/a2a-commerce.v0.3.schema.json`
- Evaluator output：`contracts/openai/evaluator-output.schema.json`
- Formatter output：`contracts/openai/formatter-output.schema.json`
- Purchase API：`contracts/purchase.v1.schema.json`
- HTTP API：`backend/openapi.json`

歷史契約只存在於 `contracts/archive/`，不得作為 live input。狀態、欄位或 enum 改動須先升版共用契約，再同步所有 producer、consumer 與 generated types。
