# ACP 測試交易驗證報告

2026-09-12；Windows、Node 24.13.0。驗證對象為根目錄整合 runtime、本地 HTTP ACP merchant、SQLite 與模擬付款；未執行正式付款或真實模型 E2E。

| 執行命令／檢查 | 結果 |
|---|---|
| `npm test` | exit 0；共用契約、42 張資料表與 migration、既有 agent／runtime／Improver 回歸通過 |
| `node --test tests/runtime.test.mjs tests/purchase.test.mjs`（完整測試內） | 12/12 通過 |
| `node --test tests/purchase.test.mjs`（最後複驗） | 8/8 通過 |
| `openspec validate add-acp-purchase-flow --strict --no-interactive --json` | valid=true，issues=[] |
| 以 `OFFERMESH_PURCHASE_MODE=live` 啟動 runtime | 如預期拒絕，live_checkout_not_configured |

ACP 專屬測試驗證固定上游檔案 SHA-256、JSON Schema 驗證、TWD 整數換算與贈品金額分配、accepted-only、buyer 隔離、未知欄位／篡改拒絕、確認 revision、並行不同 key 只建一筆訂單並扣一次庫存、create 回應遺失恢復同一 session、complete 回應遺失後重啟且報價過期仍恢復同一已完成訂單、庫存／期限／取消、無效商家回應不誤判成功、事件驗簽與去重。




本提交已移除前端修改、UI OpenSpec 與瀏覽器測試。既有 UI 測試紀錄不作為本後端提交的交付證據；僅後端 API／ACP HTTP／SQLite 範圍適用。未驗證正式商家／PSP 付款或官方 conformance。
