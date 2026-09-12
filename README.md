# OfferMesh

> Many sellers. One best deal.

OfferMesh 是 Sea × OpenAI Regional Codex Hackathon Taiwan 的一日 A2A Commerce MVP。使用者描述商品、預算與交期後，Buyer Agent 會將需求正規化，同時向五家互相隔離的 Seller 議價，再由獨立 Evaluator 排序通過硬限制的方案。Sponsored 曝光與推薦完全分離，最後仍由使用者決定是否採用與兌換。

## Demo 主線

1. 解析自然語言中的硬性條件與偏好。
2. 找出五家策略不同的 Seller，其中一家顯示 Sponsored。
3. 平行進行最多五輪議價並產生不可變的 Offer ID。
4. Backend 排除超預算、錯誤規格、錯誤交期或過期報價。
5. Evaluator 排序全部合格方案並解釋取捨。
6. 使用者確認後，以相同 Offer ID 進行限時虛擬兌換。

## 產品流程

`Request -> Format -> Orchestrate -> Negotiate -> Evaluate -> Result / Feedback`

- Seller A：最低價格，交期較慢。
- Seller B：價格較高，最快到貨。
- Seller C：價格居中，可提供免費且可拒絕的滑鼠墊。
- Seller D：價格與交期均衡，第三輪宣告 final。
- Seller E：固定價格，第一輪宣告 final。
- Backend：驗證預算、交期、商品、搭售授權、期限與 `offer_id`。
- Evaluator：只排序 Backend 已確認 eligible 的 Offer，不接收廣告資訊，也不替使用者下單。

## Demo 可靠性

- Seller 商品使用有來源與擷取時間的公開 Marketplace 快照；庫存、底價與策略是明確標示的固定模擬資料，結果可重現。
- 規則引擎提供完整 fallback，OpenAI API 不可用時主流程仍能完成。
- Sponsored 只影響 Discovery 顯示，不進入 Evaluator input 或分數。
- UI 不宣稱真實付款，只在使用者確認後執行模擬兌換。

## Repository 結構

```text
.
├─ AGENTS.md                         Codex 與開發者必須遵守的專案規則
├─ docs/
│  ├─ DEVELOPMENT_RULES.md           現行 v0.2 黑客松標準與驗收條件
│  ├─ SYSTEM_DESIGN.md               目標系統設計、API 草案與契約遷移差異
│  └─ REFERENCE.md                   設計原文的參考來源待補清單
├─ contracts/
│  ├─ a2a-commerce.v0.2.schema.json  共用 JSON Schema
│  ├─ openai/                        Evaluator Structured Outputs schema
│  └─ fixtures/                      Seller、成功流程、邊界與 API 測資
├─ db/
│  ├─ migrations/                    SQLite schema 與版本
│  └─ README.md                      資料分區與初始化說明
├─ scripts/
│  ├─ validate-contracts.mjs         JSON Schema 與跨物件契約驗證器
│  └─ db.mjs                         SQLite migration、seed 與完整性檢查
└─ package.json                      共用測試指令
```

## 開發前必讀

- [Orchestrator 前段與 Seller 函式交接](docs/ORCHESTRATOR_HANDOFF.md)：已可執行需求快照 → 搜尋 → RFQ → 第一輪函式呼叫；`npm run demo:handoff` 使用記憶體 DB 與明確標示的測試替身。
- [Seller 議價設定格式與填寫交接](docs/SELLER_NEGOTIATION_POLICY.md)：15 家／90 筆主商品待填模板；底價等私有設定由 Negotiation owner 填寫，尚未啟用。
- [目標 System Design 與 repo 整合狀態](docs/SYSTEM_DESIGN.md)
- [開發與驗收基準](docs/DEVELOPMENT_RULES.md)
- [共用契約說明](contracts/README.md)
- [JSON Schema](contracts/a2a-commerce.v0.2.schema.json)
- [Codex／專案共同規則](AGENTS.md)
- [Evaluator Structured Outputs schema](contracts/openai/evaluator-output.schema.json)
- [五家 Seller 測資](contracts/fixtures/sellers.json)
- [Marketplace 公開資料快照](contracts/fixtures/marketplace-source-snapshot.json)
- [Marketplace 測資來源政策](contracts/fixtures/MARKETPLACE_DATA.md)
- [完整成功情境](contracts/fixtures/happy-path.json)
- [完整 Demo 情境矩陣](contracts/fixtures/demo-scenarios.json)
- [安全與失敗情境](contracts/fixtures/edge-cases.json)
- [API request/response 範例](contracts/fixtures/api-examples.json)
- [SQLite schema 與操作說明](db/README.md)

`contracts/a2a-commerce.v0.2.schema.json` 是跨模組唯一資料契約。任何欄位改名、刪除、型別變更、enum 收窄或狀態語意改變，都必須先討論並升版，不能由單一模組自行修改。

`docs/SYSTEM_DESIGN.md` 描述新版目標設計。已實作五家 Seller 的同步協商、Buyer Shared Context、真實模型／fallback 與 SQLite 稽核紀錄，以及獨立 Evaluator 的完整 ID 排序、發布前重新驗證與不可變快照。協商入口見 [協商模組說明](docs/NEGOTIATION.md)，排序與整合測試見 [Evaluator 說明](docs/EVALUATOR.md)。

本次開發新增的 `npm run test:evaluator` 驗證排序與失敗路徑；`npm run test:e2e:full`／`npm run test:e2e:full:live` 從 SQLite 已解析需求，沿用遠端 Orchestrator 的 prepare 接口，執行協商、Evaluator 與重開重播，產生五套方案報告。正式自然語言 Formatter、HTTP、Swipe 及交易端尚未包含在這條測試路徑。

## 團隊分工與交付

| Owner | 建議 branch | 主要交付 | 依賴／輸出契約 |
| --- | --- | --- | --- |
| Tech Lead／整合 | `feat/backend-orchestrator` | Formatter、Orchestrator、Backend API、SQLite、狀態機、整合與部署 | 產生 `NormalizedIntent`、`OrchestrationResult`、`RequestSnapshot` |
| Negotiation／Seller | `feat/negotiation-sellers` | 五家 Seller、Catalog、底價策略、最多五輪議價、timeout、拒絕與 Bundle | 接收 `SellerRFQ`，回傳 `SellerNegotiationResult` |
| Evaluator／安全 | `feat/evaluator-safety` | Structured Outputs、硬限制複驗、排序驗證、理由、trade-off 與 fallback | 接收 `EvaluatorInput`，回傳 `EvaluatorOutput` |
| UI／產品展示 | `feat/demo-ui` | 單頁 Demo、Seller 狀態、最多五輪變化、Sponsored、推薦、替代方案與模擬確認 | 只依賴 `RequestSnapshot` 與 API response |

Owner 只負責自己模組的內部實作。跨模組交換資料必須使用 `contracts/` 的格式；不要直接依賴另一個模組的 private class、資料表或未公開欄位。

## 第一次加入專案

先確認 GitHub 帳號已取得 repository 寫入權限，再執行：

```bash
git clone https://github.com/muen1019/sea-hackathon.git
cd sea-hackathon
npm test
```

目前專案使用 Node.js 內建 SQLite，需要 Node.js 24 以上，不需安裝第三方 package。

## SQLite

新增 [前五賣家探索／評分 v0.2](docs/DISCOVERY_SCORING.md)：120 筆合成刊登、15 家模擬賣場，固定公式評分、不需 LLM。先執行 `npm run db:seed:discovery`，再以 `npm run demo:discovery` 查看 800 元滑鼠的五筆候選。

Orchestrator 已有可呼叫的 [TypeScript 資料接口](src/orchestrator/README.md)，包含需求與偏好快照、商品、Seller、評分、Campaign。執行 `npm run demo:orchestrator` 可查看真實 SQLite 回傳資料；篩選排序與 RFQ 派發尚待實作。

```bash
npm run db:init      # 第一次建立本機資料庫
npm run db:check     # 檢查完整性、外鍵、seed 與不可變規則
npm run db:rebuild   # 依 migration 與 fixture 重建
```

資料庫位於 `data/offermesh.sqlite` 且不會提交到 Git；團隊共同維護的是 migration、seed 程式和 fixture。

## 每次開始開發

不要直接在 `main` 開發。先同步主分支，再建立自己的功能分支：

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/<你的模組名稱>
```

建議 branch 前綴：

- `feat/`：新功能
- `fix/`：錯誤修正
- `docs/`：文件
- `test/`：測試與測資
- `chore/`：工具與設定

## Commit 與推送

一次 commit 只處理一個清楚目的。先檢查差異與測試，再推送：

```bash
git status
git diff
npm test
git add <本次修改的檔案>
git commit -m "feat: implement seller negotiation round"
git push -u origin feat/<你的模組名稱>
```

Commit message 建議使用：`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`。

不要 commit：

- `.env`、API key、token 或密碼
- 本機資料庫與執行產物
- `node_modules/`、cache、IDE 個人設定
- 含真實個人資料或私有交易資料的測資

## Pull Request 與合併

1. PR 只解決一個模組或一個整合問題。
2. 說明改了什麼、如何測試、影響哪些 contract 與目前限制。
3. 有 UI 變更時附截圖或短片；有流程變更時附 request／response 範例。
4. 修改 contract 時，同一個 PR 必須更新 schema、fixture、驗證器與受影響 consumer。
5. 至少由 Tech Lead 或受影響模組 Owner review 後再合併。
6. 合併前確認 `npm test` 通過，並處理所有 merge conflict。

需要同步 `main` 時，在自己的 branch 執行：

```bash
git fetch origin
git rebase origin/main
npm test
git push --force-with-lease
```

`--force-with-lease` 只能用在自己的功能 branch，不得對共享 `main` 使用。

## 共用資料安全規則

- Seller 只回傳草稿，不得自行設定正式 `offer_id` 或 eligibility。
- Backend 配置 immutable `offer_id`，並驗證價格、規格、交期、庫存、條款、搭售授權與期限。
- Seller 只能看到去識別化且可比較的真實競爭條件；不得取得其他 Seller 的名稱／ID、逐字稿、底價、Campaign 或買家私有信任資料。
- Sponsored 只影響 UI 曝光，不得進入 Evaluator input 或影響排序。
- Evaluator 只能完整排序 Backend 已驗證的 eligible Offer。不存在、重複、遺漏或過期 ID 一律拒絕。
- OpenAI API 失敗時必須使用 deterministic fallback，主 Demo 不可因此中斷。
- 推薦不等於購買；使用者必須採用並以相同 `offer_id` 在期限內兌換。

## 最小驗收流程

合併前至少確認：

1. 相同輸入可重現五家不同的最多五輪議價。
2. Seller A 最便宜但較慢，Seller B 最快但較貴，Seller C 提供免費可拒絕的相關配件。
3. 超預算、錯誤交期、錯誤規格與過期 Offer 不會進入推薦。
4. Evaluator 無法選到不存在或不合格的 `offer_id`。
5. Sponsored Seller 不會因廣告而自動成為第一名。
6. 第一次看到產品的人可在 30 秒內理解「多賣家議價，再由獨立 Evaluator 推薦」。

## 測試

使用 Node.js 24 以上版本，安裝鎖定相依套件後執行全部現有測試：

```bash
npm ci
npm test
```

目前會檢查所有 JSON、共用 schema 邊界、五家 Seller 策略、最多五輪議價、RFQ 隱私、正式 Offer 引用、硬限制、Sponsored 隔離、Evaluator ID 完整性與 API idempotency 範例。

## 黑客松期間新增內容

前段整合已加入完整商品偏好轉換、SellerRFQ 白名單、綁定快照的函式 registry、第一輪平行派發／逾時／回應驗證、SQLite 交接計畫與重播防護。Seller 策略與後續輪次、正式 Offer 商務驗證仍待接續；這不是完整議價或付款流程。既有 DB 可用 `npm run db:migrate` 備份後非破壞性升級。
目前新增了 SQLite-backed Orchestrator 讀取工具、15 家 Seller／120 筆合成刊登（90 滑鼠、30 滑鼠墊）、五個不同 Seller 的確定性排序與結果快照。目標價格選填，缺值時按有效指標重新分配權重，詳見 [評分標準](docs/DISCOVERY_SCORING.md)。不滿五個合格結果時可補標記替代方案，但違反硬限制者不能自動議價；不足五個可用賣家則明確回報。新增資料不是 120 筆真實爬取商品。

新增 Seller 私有政策 schema、15 家待填模板、填寫說明及驗證測試；實際議價 handler、策略數值、私有政策 DB 接線、UI 與完整新流程仍待各 Owner 整合。已整合隊友的五家／五輪 canonical 測資；Discovery 刊登 ID 與 canonical 商品 ID 仍分開。

本 repository 為本次黑客松建立。第一版已完成共同開發規則、完整資料契約、OpenAI Structured Outputs 格式、三家 Seller 固定測資、兩輪議價範例、API 範例與無第三方相依的契約驗證器。

v0.2 已完成五家 Seller／最多五輪的契約、19 次議價交換與 6 筆最終 Offer 測資、提前 final／失敗停止驗證，以及保留舊資料的 SQLite migration。新增 Ajv／ajv-formats 驗證實際 JSON Schema。

本次新增 `src/negotiation/`：五組獨立 Buyer／Seller、最多五輪同步 barrier、去識別化共享競爭條件、Responses API Structured Outputs、deterministic fallback、Backend 報價驗證、期限／成本上限與 SQLite 不可變稽核紀錄。`npm run demo:negotiate -- --offline` 可執行完整協商；填入 `.env` 的 `API_KEY` 後執行 `npm run demo:negotiate -- --live`。模型設定及整合限制見 [NEGOTIATION.md](docs/NEGOTIATION.md)。Swipe session 及偏好學習仍未實作。

新增 25 組 unit tests，以及離線／真實模型 E2E：`npm run test:e2e`、`npm run test:e2e:live`。使用者確認的五套 [銷售偏好](contracts/fixtures/sales-profiles.json) 展示讓價、快速配送、免費周邊、較便宜的組合、固定價格。修正模型可繞過固定價格的問題，加入有底價保護的 bundle 折扣。E2E 會產生五張方案卡、逐輪紀錄和 14 項驗證報告；歷史資料庫重開後必須重播同一組 Offer ID。

後續每個 PR 都要更新本節或 PR 說明，讓評審可以辨識黑客松期間完成的工作。

## 既有專案與 OSS

目前沒有沿用既有個人專案或第三方程式碼。後續加入 OSS 時，請在本節補上名稱、版本、授權與來源連結。
