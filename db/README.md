# Result v0.3 migration

目前 API 已使用 main 的表格與 001/002/003 migrations。003_result_decisions.sql 保留原 published_snapshot_json，新增可恢復的 result_state_json／contract_version／decisions.result_json；reject 保存 feedback 與原文件，不建立 child。過去 child／redemption 欄位保留歷史用途，不代表 API 會呼叫它們。API 自動備份並遷移舊 Result 檔案；CLI 的 db:rebuild 仍會明確重建 demo，不能用來遷移使用中資料。

以下完整資料模型中的長期偏好／feedback_events／兌換是後續整合，現行略過只在前端保存。

# OfferMesh SQLite

SQLite 是 Backend 的唯一持久狀態來源。Agent 可以理解拒絕原因並提出 preference update，但只有 Backend 驗證後寫入這個資料庫的內容才有效。

## 指令

```bash
npm run db:init      # 第一次建立 data/offermesh.sqlite
npm run db:check     # 檢查既有資料庫
npm run db:rebuild   # 刪除並重建固定的本機資料庫
npm run test:db      # 使用記憶體資料庫測試 migration、seed 與 invariants
```

實際 `.sqlite`、WAL 與 SHM 檔案不進 Git。團隊共享 `db/migrations/`、`scripts/db.mjs` 與 `contracts/fixtures/`，每個人都能重建同一份資料。

## 資料分區

- Catalog：`marketplace_sources`、`sellers`、`products`、`product_sources`、`seller_inventory`、`terms`、`campaigns`。
- Request：`users`、`requests`、`request_sellers`。
- Negotiation：`negotiation_rounds`、`offers`。
- Ranking：`evaluations`、`evaluation_runs`（執行權、不可變結果與模型 audit）。
- Swipe learning：`feedback_events`、`user_preferences`。
- Checkout：`decisions`、`redemptions`。
- Reliability：`idempotency_keys`、`schema_migrations`。

## 左滑更新偏好

左滑先新增一筆 `feedback_events`。沒有回答原因時只保存 `implicit_only = 1`，不能升級成硬限制；有明確原因時保存 `preference_update_json`，建立新的 child request，必要時再將高信心的跨次偏好寫入 `user_preferences`。既有 Request snapshot 與 Offer 都不可修改。

## Seed 內容

初始化會匯入 Marketplace 快照、五家 Seller、九個商品、庫存與 Campaign，並載入 `happy-path.json` 作為可直接檢查的 Demo Request。左滑、購買與 idempotency 表維持空白，交由 API 實際寫入。

## v0.2 migration

初始化依序套用 `001_initial.sql`、`002_five_seller_negotiation.sql` 與 `003_negotiation_runtime.sql`，再載入目前 fixtures。第二個 migration 擴充 round 為 1～5、每個 Request 最多五家 Seller，加入 is_final／stop_reason，將兩個折扣欄位轉為五輪折扣陣列。第三個 migration 增加 `negotiation_runs`、`negotiation_commits`、`negotiation_offers`，保存真實協商輸入、逐輪不可變歷史與正式 Offer。舊前兩輪折扣與已保存 Offer、Bundle baseline、採用、兌換及發布快照保持原值。

`npm run test:db` 同時驗證含舊資料的升版與全新 seed，canonical 歷史為 19 次議價、6 筆最終 Offer。既有本機資料庫可用 `npm run db:migrate` 備份並套用 migration，不需清除已保存的執行紀錄。

`002_discovery.sql` 與 `003_orchestrator_handoff.sql` 保存搜尋與交接計畫。`004_seller_bundle_preferences.sql` 增加私有組合折扣；`005_evaluation_runtime.sql` 與 `006_evaluation_audit.sql` 保存排序執行權、結果與 audit。初始化按 migration 檔名順序套用所有尚未執行的 migration。E2E 在獨立資料庫載入 `sales-profiles.json`，不修改 canonical 歷史快照。
