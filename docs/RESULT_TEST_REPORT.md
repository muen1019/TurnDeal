# Result API v0.3 驗證紀錄

2026-09-12，Windows，Node 20.19.5。這份紀錄涵蓋 Result backend 與 frontend 的真實 API 整合；同時修改 UI 的另一個 session 所新增工作，僅列入已實跑的檢查。

| 目錄 | 指令 | 實跑結果 |
| --- | --- | --- |
| backend | npm test | 3 suites、36 tests passed |
| backend | npm run build | TypeScript 編譯成功 |
| frontend | npm test | 12 suites、81 tests passed |
| frontend | npm run build | typecheck 與 Vite production build 成功 |
| frontend | npm run test:api:e2e | Chromium → production preview proxy → 真實 Express → SQLite 通過 |
| 根目錄 | npm test | 共用 v0.3 schema、fixtures 一致性、生命週期及 OpenAPI refs 通過 |
| 根目錄 | openspec validate define-offer-result-ui-api --strict | valid（使用本機快取 OpenSpec 1.13.0） |

backend 測試涵蓋：mock 預算／交期／配件限制、未知與矛盾輸入、no_match、唯一 Offer ID、不可變快照、accept 期限等號、buyer scope、reject 原文與原始文件、輸入驗證、冪等重播／衝突／處理中、accept/reject 真實並行競爭、commit failure rollback、重啟與 processing_interrupted。另驗證五家 Seller／最多五輪、提前 final、舊 Result DB 自動備份與遷移、accept/reject 與報價保留、到期後冪等重播，以及決策不修改已發布快照或庫存。

瀏覽器實跑：儲存代理設定、Chat 建立需求、五家賣家／六組最終方案、滑鼠右滑立即採用、重載恢復 accepted、建立另一需求、鍵盤逐張略過（沒有 POST）、明確送出帶前後空白的回饋、200/rejected、重載恢復 feedback 與原始 source_documents。每輪只有一個決策；沒有 child 或 redemption 請求，沒有 pageerror。另保存 390px rejected 畫面。

可重跑的正式 runtime 瀏覽器測試：`npm --prefix frontend run test:e2e`。本機產物（gitignored）：

- [機器可讀結果](../frontend/test-results/result-api-e2e.json)
- [採用畫面](../frontend/test-results/result-api-accepted.png)
- [拒絕畫面](../frontend/test-results/result-api-rejected.png)
- [390px 畫面](../frontend/test-results/result-api-mobile.png)

根目錄 DB 測試亦通過：22 張表、5 Sellers、9 products、integrity_check / foreign_key_check 與不可變報價檢查。根目錄 SQLite CLI 使用 Node 24。

## 可操作服務

現行整合入口是 repository 根目錄的 `npm run dev`／`npm run dev:secure`，UI 固定透過 proxy 使用 `backend/runtime` 與同一份 SQLite。`npm --prefix frontend run test:e2e` 會建立隔離的暫存資料庫並驗證正式 runtime HTTP、結果 UI、Improver 與 reload 流程。

## 驗證邊界

僅為本機固定 demo buyer；SQLite 檔案只由單一常駐服務使用。沒有正式登入、跨裝置保存、Buyer Agent 改寫或自動交付、真實 Seller/Evaluator、兌換或付款。mock parser 僅支援 backend README 所列有界範例。

未把另一個 session 正在擴充的廣泛 UI E2E、真機觸控、軟鍵盤、全尺寸動畫中斷與逐幀視覺驗收宣稱為通過。OpenSpec 第 4–6 批未完整驗收的任務仍未勾選，change 未 archive。持續中的其他 session 可能使檔案晚於本次驗證；API 整合測試已獨立保存，便於重跑。

最新修正驗證：前端 Vite mock 與 `/__mock` sidecar 已移除，開發與 production build 都只使用 runtime API；進度直接來自正式 RequestSnapshot。E2E 斷言 HTTP API 請求皆為建立需求、取得快照或提交決策。

Rebase origin/main cdce6e5 後：合併 discovery 與 handoff migrations（共 5 份）；orchestrator 共用 v0.3 schema。根目錄完整測試通過，包含 11 項 orchestrator、3 項 seller policy 測試；前後端 build 及 production API E2E 通過。
