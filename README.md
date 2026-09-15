# TurnDeal

> Many sellers. One best deal.

TurnDeal 是 Sea × OpenAI Regional Codex Hackathon Taiwan 的 A2A Commerce MVP。使用者描述商品、預算與交期後，系統會整理需求、搜尋合格商品、讓多個 Buyer／Seller 分支各自議價，再由獨立 Evaluator 排序通過後端驗證的方案。Sponsored 只影響展示，不影響推薦；採用方案也不等於付款。

目前 MVP 聚焦一隻無線滑鼠，並可包含至多一張相關滑鼠墊。所有價格都是含稅運的整數 TWD。

## 快速啟動

需求：Node.js 24。

```powershell
git clone https://github.com/muen1019/TurnDeal.git
cd TurnDeal
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run dev
```

開啟 <http://127.0.0.1:5173/chat>，儲存代理設定後可輸入：

```text
滑鼠 800 元左右，預算 1,000 元含稅運，7 天內到貨。
```

預設模式完全離線，不需要 OpenAI API key，仍會實際執行 Formatter、Discovery、五家 Seller 議價、Evaluator fallback，以及 SQLite 決策保存。詳細啟動方式見 [完整應用操作](docs/RUN_FULL_APP.md)。

## 啟用模型

```powershell
npm run dev:secure
```

此命令會在終端機隱藏輸入 API key，只把 key 提供給後端程序，不寫入檔案，也不傳入前端環境。請勿把 key 貼進聊天、issue、Git 或商品需求。

程式碼中的 `offermesh` package 名稱與 `OFFERMESH_*` 環境變數目前為相容性名稱；產品與 repository 名稱是 TurnDeal。

## 執行流程

```text
Request → Format → Orchestrate → Negotiate → Evaluate → Result → Feedback
```

1. Formatter 合併本輪文字與固定的偏好快照，產生 `NormalizedIntent`。
2. Discovery 以硬限制篩選，再依可重現的規則排序候選。
3. Orchestrator 取自然排名前五個合格 Seller，各自建立隔離的 Buyer 分支。
4. Negotiation 最多五輪；完成、拒絕、逾時或失敗的分支會停止，其他分支繼續。
5. Backend 驗證報價、庫存、價格、交期、配件授權、條款與期限。
6. Evaluator 只能排序完整且合格的 Offer ID 集合。
7. 使用者可以採用或拒絕；採用後仍須另外明確確認，才會進入 ACP 測試購買。

## 信任與安全邊界

- Seller 輸出不受信任；正式 Offer ID、資格與不可變快照由 Backend 建立。
- 每家 Seller 只看到自己的 RFQ、政策與對話。競爭資訊必須去識別化。
- Campaign 不得進入 Evaluator input，也不得改變自然排序或增加議價分支。
- 未明示允許付費配件時，只能推薦無額外費用、相關且可拒絕的配件。
- POST API 使用 idempotency key；資源依已驗證的 buyer 身分隔離。
- SQLite 是需求、偏好、議價與決策的資料正本；瀏覽器草稿與 Agent 記憶不是。
- ACP 路徑僅模擬付款，不會真實扣款、退款或出貨。

## Repository 結構

| 路徑 | 用途 |
| --- | --- |
| `backend/runtime/` | Node 24 完整整合 API |
| `backend/src/` | Node 20 legacy Result server 與共用模組 |
| `frontend/` | React／Vite 單頁展示 |
| `src/` | Formatter、Orchestrator、Negotiation、Evaluator 核心 |
| `contracts/` | 共用 JSON Schema、OpenAI Structured Outputs 與 fixtures |
| `db/migrations/` | SQLite 權威 schema |
| `docs/` | 現行架構、操作與模組文件 |
| `openspec/changes/` | 尚未封存的規格變更與待辦 |

完整服務使用 `data/app.sqlite`。Runtime database、測試輸出與產生式報告不提交 Git。

## 文件

- [文件索引](docs/README.md)
- [完整前後端啟動](docs/RUN_FULL_APP.md)
- [系統架構](docs/SYSTEM_DESIGN.md)
- [開發與驗收規則](docs/DEVELOPMENT_RULES.md)
- [intent.md／preference.md 語意](docs/INTENT_PREFERENCE_SPEC.md)
- [共用契約](contracts/README.md)
- [SQLite schema 與 migration](db/README.md)
- [測試方式](docs/TESTING.md)

`contracts/a2a-commerce.v0.3.schema.json` 是所有 active producer 與 consumer 的共用資料契約；Evaluator Structured Outputs 只能使用 `contracts/openai/evaluator-output.schema.json`。

## 驗證

```powershell
npm test
npm --prefix backend test
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run build
```

契約或 fixture 有變動時，至少執行 `npm run test:contracts`。端到端與瀏覽器檢查見 [測試指南](docs/TESTING.md)。

## Hackathon 範圍與來源

活動期間完成共用契約、SQLite migrations、Formatter、120 筆 synthetic listings、Seller policies、五分支議價、獨立 Evaluator、Result UI、回饋保存、Buyer Request Improver 與 ACP 測試購買流程。賣家、價格、成本、權益與履約資料均為展示用 synthetic data，不代表真實平台或商家承諾。

應用使用 React、Vite、Express、sql.js、Ajv、Playwright 等 OSS，相依版本固定於各 package lockfile。規格工作流使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec)。ACP 固定上游版本與授權資訊位於 `contracts/acp/`。
