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
- Ranking：`evaluations`。
- Swipe learning：`feedback_events`、`user_preferences`。
- Checkout：`decisions`、`redemptions`。
- Reliability：`idempotency_keys`、`schema_migrations`。

## 左滑更新偏好

左滑先新增一筆 `feedback_events`。沒有回答原因時只保存 `implicit_only = 1`，不能升級成硬限制；有明確原因時保存 `preference_update_json`，建立新的 child request，必要時再將高信心的跨次偏好寫入 `user_preferences`。既有 Request snapshot 與 Offer 都不可修改。

## Seed 內容

初始化會匯入 Marketplace 快照、三家 Seller、七個商品、庫存與 Campaign，並載入 `happy-path.json` 作為可直接檢查的 Demo Request。左滑、購買與 idempotency 表維持空白，交由 API 實際寫入。
