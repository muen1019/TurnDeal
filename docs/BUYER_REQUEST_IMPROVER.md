<!-- Backend-only scope -->
本提交不包含 frontend 修改或 UI 規格。API 能力與測試仍適用；介面呈現、滑動事件提交與前端進度顯示須由後續前端工作接入。

# Buyer Request Improver

更新：目前 UI 已接 versioned selection、改善追問、唯一 child 與下一輪讀取，取代 legacy 自建 refinement。整合細節與剩餘全域偏好同步邊界見 [TurnDeal workflow](TURNDEAL_WORKFLOW.md)。

## 已實作

內部流程：Context Builder → 一次 LLM proposal（可修正一次）→ schema／evidence／semantic validation → 原子 revision commit。

- intent 是本次商品需求，每個成功處理的 job 保存一個 ready revision 或待澄清 draft。舊 Request documents、Offer 與 decision 不改動。
- preference 是使用者全域文件；只有明確長期原話才允許 patch。只拒絕、重複左滑或「這次」偏好都不能學成長期偏好。
- SQLite 保存固定輸入、工作 lease、模型次數、文件版本、偏好快照與 patch 稽核。每 parent 一個初始 job，澄清建立不可變 successor；工作中斷可恢復，失效 worker 不能提交。
- 無模型、逾時或不合法輸出走固定模板，保存 needs_clarification 草稿，不把 fallback 包裝成 LLM 成功。

實作位於 backend/src/improver/，新增 migration 為 db/migrations/004_buyer_request_improver.sql。Backend 使用原本單一常駐 SQLite writer，不新增外部服務。

## 執行與金鑰

先安裝 root 與 backend dependencies。Root 命令使用 Node 24；Node 20.19.5 的 legacy backend 亦已回歸驗證。

```text
npm run test:improver
npm run demo:improver
npm run demo:improver:live
```

前兩個命令不需要 API key。第三個命令明示啟用真實 Improver 模型；搜尋／議價／Evaluator 仍使用離線策略，資料是記憶體 DB 中的合成案例，不修改使用者正式需求。

服務端設定：

```dotenv
API_KEY=
IMPROVER_MODEL=gpt-4.1-mini
```

Loader 依序讀取 workspace 父目錄 `.env`、repository `.env`、backend `.env`，後者覆蓋前者；process environment 優先。只讀 API_KEY / IMPROVER_MODEL，不把 key 注入 Vite、不寫回 `.env`、不記錄上游錯誤 body。provider 端點固定為 https://api.openai.com/v1/responses，store=false，使用嚴格 Structured Outputs；參考 [官方格式說明](https://developers.openai.com/api/docs/guides/structured-outputs)。

全應用原本的啟動與其他模組 key 政策保持原狀；live runtime 與 live demo 的 Improver 會讀取並使用此設定，offline 不呼叫模型。沒有文字回饋時直接保存待澄清草稿，不浪費模型呼叫。

## 內部接線

Node 24 RuntimeStore 使用 backend/runtime/improver.mjs（先 build backend），它提供同一 DB 的 storage port，並注入現有 src/formatter/parser.ts 的純函式驗證。Legacy OfferStore 提供 improvementStorage()，使用其 sql.js transaction/persist 機制。

```javascript
import {createRuntimeImprover} from './backend/runtime/improver.mjs';

const improver = createRuntimeImprover(runtimeStore, {mode: 'live'});
const job = improver.repository.enqueueRejectedRequest(buyerId, requestId);
const completed = await improver.run(buyerId, job.improvement_id);
// completed.result: ready 或 needs_clarification；重讀／重跑不建立第二份 revision。
```

整合版 API 接受 selection_version: 1 與 rejected_offer_ids。接受時提交先前拒絕的子集合（不得包含已接受 offer）；拒絕時要求完整非空排名集合且未過期。原始 feedback 可省略於接受操作，全部拒絕無文字回饋使用空字串。決策與工作透過同一 transaction／savepoint 原子保存，回傳原決策 200 後背景執行。右滑後的改善只保存獨立 revision，不改動已採用方案或自動建立 child。

執行 recover(buyerId) 只恢復已存在 queued／過期 running 工作，不掃歷史 rejected request 新建工作。每次模型调用最長 30 秒，每 job 最多兩次呼叫，lease 90 秒、最多兩次領取。儲存錯誤向呼叫端拋出；未提交結果不宣稱成功，後續可在 lease 過期後恢復。

## 文件表示與支援範圍

全域文件使用可定位的區塊：

```markdown
<!-- offermesh-preference:mouse_size scope=category:mouse -->
偏好小尺寸
<!-- /offermesh-preference -->
```

未涉及區塊的文字逐字保留。若既有自由文字可能與新增偏好衝突，或無法定位替換目標，採 keep，不覆寫全文。明示編輯接口 saveGlobalPreference(buyer, markdown, baseRevision) 供未來全域編輯器使用；不會自動拿 Request preference_md 初始化全域文件。

目前可重現的長期句型涵蓋「我買東西一向先看耐用度」「我挑滑鼠一直都偏好小尺寸／黑色」「我購物一向價格優先」。替換／移除另要求完整明示，例如「我以後挑滑鼠不再偏好小尺寸，改成價格優先」。MVP 語意檢查是保守支援集，不宣稱能理解所有自然語言。生成 patch 仍不等於一定發布：本次 intent 必須 ready；例如尚未有可執行耐用度條件時會保留待澄清提案，不更新全域版本。

本次需求支援明示數字預算修正、交期修正、價格優先與已支援小尺寸偏好；無法驗證的改寫保存安全草稿。Hard constraint 檢查同時比對原始 NormalizedIntent，避免遺失從既有 DB 偏好繼承、原文中未出現的硬要求。

## 前端與恢復

前端整合時，最後一張左滑應提交全部拒絕；部分左滑保留在分頁，右滑時隨接受提交。需沿用 pending journal 與 idempotency key 恢復未知結果。GET /api/requests/{request_id}/improvement 提供 buyer-scoped 狀態與公開結果；前端需串接 queued/running、ready/draft、澄清問題與偏好是否更新的顯示，本 PR 不包含 UI。服務每五秒恢復既有 queued 或 lease 到期的工作，不自動重處理歷史決策。舊 legacy server 與 Result mock 不提供完整 Improver workflow。

## 尚未整合

以下工作尚未接入：

- 全域 preference 編輯器與既有 user_preferences 的投影／同步契約。新 improver_global_preferences 版本庫尚未取代 Formatter 原有 user_preferences 讀取。

後端 ready 自動建立 child、跨輪交接及澄清後重新提交已實作。API、重送與前端串接步驟見 [後端整合指南](IMPROVER_BACKEND_INTEGRATION.md)。

目前結果文件中的 preference 是固定版本的完整 Markdown；child adapter 已依表示層投影已管理條目並凍結 Formatter 結果，保留固定快照。前端仍需串接 API 與下一輪連結。
