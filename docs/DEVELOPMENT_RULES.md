# 開發與驗收基準 v0.3

目前前後端與完整產品資料使用 a2a-commerce.v0.3.schema.json。五家／最多五輪 mock 已接入 Result API；reject=200/rejected 保存原始 feedback/source_documents，不改寫、不建立 child。Buyer Agent 改寫、兌換與完整模型 pipeline 仍是後續整合。

本文件將主辦方簡報、產品提案與團隊分工整理成可執行的工程規則。後續開發與驗收均以此文件及 `contracts/` 為準。

新版目標設計已整理於 [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)。五家 Seller、最多五輪、同步 barrier、共享競爭條件、真實模型與 deterministic fallback 已有協商模組，見 [NEGOTIATION.md](NEGOTIATION.md)。Swipe 決策與長期偏好仍屬目標設計。

## 主辦方評分標準

| 評分面向 | 本專案的開發要求 | 可展示證據 |
| --- | --- | --- |
| 問題與解決方案適切性 | 清楚說明買家跨賣家比較與議價的真實成本，以及獨立排序如何降低資訊不對稱 | 一次輸入觸發五家 Seller 並取得可比較 Offer |
| 開發品質 | 主流程必須可實際運作並穩定重播，錯誤、逾時與 API 失敗均有明確結果 | 自動驗證、固定測資、timeout、fallback、idempotency |
| 洞察與創新性 | 展示 Buyer 與 Seller Agent 隔離議價、意圖驅動商品探索、廣告與推薦分離 | 私有 RFQ、最多五輪議價、Sponsored 不影響 Evaluator |
| 實際應用價值 | Demo 必須呈現受益對象、節省的決策成本與可延伸商業價值 | 價格、交期、贈品與信任的可解釋 trade-off |
| 開發方向契合度 | 至少充分體現「自主且具適應能力的 AI」或「AI 原生產品與營運」 | 自動格式化、編排、平行議價、獨立評估、回饋迴圈 |
| Codex 應用深度 | 使用 Codex 產出與驗證契約、測資、程式、測試、文件及整合紀錄 | Git commit、PR、測試輸出與開發日誌 |

## 主辦方交付規則

- 所有黑客松成果需於現場完成。
- 專案使用新的公開 GitHub repository。
- 若沿用既有個人專案或 OSS，README 與提交表單必須附來源連結，並明列活動期間新增的重大功能。
- 每隊提交一份作品，包含公開 GitHub repository、專案說明、選填 Demo 連結與特殊說明。
- 目前簡報記載提交截止時間為活動當日下午 5:35。
- 第一輪展示為 6 分鐘 Demo 或簡報，加 2 分鐘問答。第二輪為 6 分鐘展示，加 3 分鐘問答。

## MVP 範圍

- 商品：滑鼠與滑鼠墊。
- Seller：五家固定虛擬商家，資料與策略可重現；Orchestrator 取自然排序前五家合格 Seller，不足則用實際數量，不放寬硬條件。每家建立一個 Buyer Agent，退出後不補派。
- 流程：Request、Format、Orchestrate、Negotiate、Evaluate、Result 或 Feedback。
- 議價：每家最多五輪，同輪 active branches 平行、輪間同步；final／refuse／timeout／error 只停止該分支，其餘繼續。round timeout、整體 deadline 與呼叫／token 預算須在 Backend 啟動 Request 時固定；具體值待實測，不沿用舊版 8 秒作為五輪完成承諾。
- 儲存：單一常駐 Backend 與 SQLite；不引入 Redis、訊息佇列或微服務。
- 交易：採用後以 immutable `offer_id` 在期限內完成虛擬兌換。真實付款、ACP 與廣告計費不在本版範圍。

## 必須維持的信任邊界

1. Seller 只取得自己的 RFQ，可包含上一輪 Backend 已驗證、仍有效且去識別化的競爭條件；不取得其他 Seller 名稱／ID、Offer ID、逐字稿、底價、完整原文、買家私有預算、個人交易紀錄或 Campaign。不同型號須保留差異，不能把不同 Offer 的價格與交期合成虛構條件。
2. Seller 回傳的是報價草稿，不可自行宣告 `eligible`。
3. Backend 依 Catalog 快照、預算、交期、商品規格、配件授權、條件與期限計算 eligibility。
4. Evaluator 只收到 eligible Offer、NormalizedIntent 與有來源的 Trust 摘要，不收到 Sponsored/Campaign 資料。
5. Evaluator 回傳的每個 `offer_id` 都必須存在、合格、未過期且完整排列；否則拒絕輸出並啟用 fallback。
6. UI 顯示 Sponsored 標記，但不能暗示贊助影響推薦。

## 狀態與 API

正常狀態依序為：

`formatting -> orchestrating -> negotiating -> evaluating -> awaiting_user -> accepted -> redeemed`

其他終止或分支狀態為 `needs_clarification`、`needs_confirmation`、`no_match`、`failed` 與 `rejected`。

HTTP API 固定為：

- `POST /api/requests`
- `GET /api/requests/{request_id}`
- `POST /api/requests/{request_id}/decisions`
- `POST /api/redemptions`

所有 POST 要求 1 到 128 字元的 `Idempotency-Key`。相同 buyer、method、path、key 與 payload 必須重播原結果；相同 key 不同 payload 回 409。

## 團隊整合驗收

| Owner | 交付物 | 驗收條件 |
| --- | --- | --- |
| Tech Lead | schema、Formatter、Orchestrator、Backend、整合與部署 | 輸入需求後可取得合格 Seller 清單並啟動議價 |
| Negotiation | 五家 Seller 資料、私有策略、最多五輪議價與 Offer 草稿 | 相同輸入穩定產生五條明顯不同的議價軌跡 |
| Evaluator | Structured Outputs、Validator、推薦原因與 fallback | 不可能發布不存在、過期或違反硬限制的 ID |
| UI | 單頁 Demo、狀態、最多五輪變化、Sponsored、推薦與模擬確認 | 新觀眾 30 秒內理解多賣家議價與獨立推薦 |

## 契約變更流程

- v0.2 開發期間，新增 optional 消費端能力可在不破壞既有 fixture 的前提下加入。
- 欄位改名、刪除、型別變更、enum 收窄或狀態語意改變屬 breaking change，必須升版並同步更新所有 owner。
- Schema、fixture、驗證器必須在同一個 PR 變更。
- Merge 前執行 `npm run test:contracts`。
