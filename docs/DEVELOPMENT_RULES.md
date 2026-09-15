# 開發與驗收基準

本文件把 hackathon 交付要求轉成 TurnDeal 的工程規則。詳細不變量同時記錄於根目錄 `AGENTS.md`；實作、文件與測試不得互相矛盾。

Buyer profile 是明示 SQLite 更新；新 Request 凍結 ranking weights、模型、文件與偏好。Formatter clarification 與 versioned Improver 以 linked child／revision 接續，不改寫 parent。基本資料、地址與付款偏好不進模型。

## Hackathon 評分對應

| 面向 | TurnDeal 的展示重點 |
| --- | --- |
| 問題與適切性 | 降低買家跨賣家搜尋、議價與比較的成本 |
| 開發品質 | 固定契約、可重現資料、SQLite 恢復、timeout、fallback、idempotency |
| 創新 | Buyer／Seller 隔離協商，以及廣告與獨立推薦分離 |
| 應用價值 | 將價格、交期、贈品、售後與信任轉成可比較 trade-offs |
| AI 原生 | 自動格式化、編排、平行議價、獨立評估與受控改善 |
| Codex 深度 | 契約、fixtures、程式、測試、文件與 integration history |

公開 repository 與 root README 必須列出活動期間完成內容及沿用的 OSS／來源。保留有意義的 Git history，讓評審能辨識實作過程。

## MVP 範圍

- 一隻無線滑鼠，至多一張同 Seller 的相關滑鼠墊。
- 自然排名最多五個合格 Seller，各有一個 private Buyer branch。
- Request → Format → Orchestrate → Negotiate → Evaluate → Result 或 Feedback。
- 每個 branch 最多五輪；同輪 active branches 平行、輪間同步。
- Node 24 integrated runtime、React frontend 與單一 SQLite writer。
- Offline deterministic path 必須完整可跑；live model 是可選能力。
- Accept／reject 已接 UI；Buyer Request Improver 支援受控 revision／child workflow。
- ACP test purchase 只有 Backend API 與模擬付款，尚無購買 UI、正式 PSP、扣款、退款或出貨。

## 信任與隱私

1. Seller 只取得自己的 RFQ、Catalog／policy、歷史與去識別化 competitive terms。
2. 不得分享其他 Seller 身分、Offer ID、逐字稿、底價、政策、Campaign、trust data 或完整買家文件。
3. Seller 與模型輸出都是 untrusted draft；Backend 決定 Offer ID 與 eligibility。
4. Backend 驗證 ownership、SKU、庫存、整數含稅運總價、底價、成本、交期、terms、expiry、權益與配件授權。
5. 未明示付費配件時，只能使用免費、相關且可拒絕的 add-on。
6. Sponsored 只影響 display；不能改自然排名、增加 branch 或進入 Evaluator input。
7. Evaluator 只能排序完整的 Backend-validated eligible ID set，發布前再次驗證。
8. UI 不顯示 private prompt、raw model audit、底價或競爭來源身分。

## 文件與偏好

`intent_md` 是本輪交易文件；CreateRequest 的 `preference_md` 是 request-bound snapshot。`NormalizedIntent` 是本輪的有效執行資料。

Formatter 不更新長期偏好。左滑、拒絕或一次性描述不能自行提高預算、授權付費或變成長期設定。只有明確、受支援且通過驗證的長期表述，才能成為 Improver preference patch 候選。

已發布 Request、文件、Offer、negotiation commit 與 snapshot 不可變。Accept／reject 與 Improver revisions 分開保存。

## 狀態與 API

Request processing 依序為 `formatting`、`orchestrating`、`negotiating`、`evaluating`，再進入 `awaiting_user` 或 `needs_clarification`、`needs_confirmation`、`no_match`、`failed`。Decision 另記 accepted／rejected，不改寫已發布 snapshot。

核心 HTTP lifecycle：

- `POST /api/requests`
- `GET /api/requests/{request_id}`
- `POST /api/requests/{request_id}/decisions`
- `GET /api/preferences` and `POST /api/preferences`
- Improver status／clarification endpoints
- Accepted Offer 的 Purchase endpoints

HTTP 路徑與 payload 以 `backend/openapi.json` 為準。所有 POST 都需要 stable `Idempotency-Key`；相同 buyer／method／path／key／body 重播原結果，相同 key 不同 body 必須衝突。

## 資料與恢復

- `db/migrations/` 是 SQLite schema 正本；runtime DB 不提交。
- 啟動可套用缺少的 migration 與 versioned seed，但不得重建歷史價格、庫存或 Offer。
- 同一 DB 一個 writer；不得跨模型／網路 await 持有 transaction。
- 結果未知時先查 authoritative state 或用同 key／body 重播，不能任意建立第二次操作。
- 可安全恢復的 durable job 依 lease／workflow 恢復；可能已有外部副作用的 call 不盲目重送。

## 品質門檻

- 同一 canonical request 顯示五種可重現策略：A 低價慢送、B 高價快送、C 配件 trade-off、D 第三輪完成、E 第一輪 firm。
- 不足五個合格 Seller 時使用實際數量，不以 alternative、Sponsored 或重複 Seller 補位。
- UI 應讓新觀眾在 30 秒內理解多 Seller 議價、獨立推薦、Sponsored 標示與使用者最後決定。
- 錯誤、timeout、restart 與模型失敗必須有明確、可恢復或安全終止的結果。
- 測試以 assertions 和 deterministic fixtures 為證據，不以日期化 pass count 取代可重跑指令。

## Contract change

`contracts/a2a-commerce.v0.3.schema.json` 是 active shared contract。欄位改名／刪除、型別改變、enum 收窄或狀態語意改變都是 reviewed version change。Schema、fixtures、validators、generated types 與 consumers 必須一起更新。

Contract 或 fixture change 合併前執行：

```powershell
npm run test:contracts
```

完整驗證矩陣見 [TESTING.md](TESTING.md)。
