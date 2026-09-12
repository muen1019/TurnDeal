<!-- Backend-only scope -->
本提交不包含 frontend 修改或 UI 規格。API 能力與測試仍適用；介面呈現、滑動事件提交與前端進度顯示須由後續前端工作接入。

# Improver 驗證紀錄

日期：2026-09-12。範圍包含 Improver 核心，以及 selection_version: 1 的決策 API、背景工作與前端滑動接線。全域編輯器、澄清後重新提交與 child 編排尚未實作。

## 本次選擇流程接線驗證

- 根目錄 `npm test` 通過，包含 contracts、42 表的 DB integrity／foreign key 檢查、原模組與 purchase 回歸，以及 31 個 Improver 核心＋9 個 runtime／selection 測試。
- Node 20.19.5：backend 全部 67 個測試、frontend 全部 91 個測試通過；兩端 TypeScript 檢查通過，frontend Vite build 通過。
- `openspec validate add-buyer-request-improver --strict` 通過。
- `tests/improver-selection.test.mjs` 驗證：先左滑再接受、全部拒絕無回饋、明確長期回饋、接受無拒絕紀錄、無效／跨輪／重複 ID、expiry、跨 buyer 存取、原 key 重送、queue 寫入失敗整筆回滾。
- 特別以等待中的 provider 驗證：Improver 保持 running 時，購買 API 仍可為相同 accepted offer 建立 checkout；改善完成後原文件與已採用商品不變，沒有 child。
- `useWorkspace.test.ts` 新增實際 hook 驗證：部分 skip 不送 API，最後 skip 自動提交完整集合及空 feedback；網路失敗後重用同一 body／key；右滑只攜帶先前拒絕的子集合。
- Headless Chromium、實際 production bundle＋隔離記憶體 runtime：以 pointer 左滑一次後右滑、另一輪連續七次左滑；均出現 needs_clarification 草稿且 preference 不變。重新整理仍讀到同一 improvement_id，頁面無 JavaScript 錯誤。購買卡片在接受後的對話內顯示，改善結果可在同一對話捲動查看；全部拒絕頁顯示草稿與澄清問題。
- 瀏覽器驗證先發現接受後轉向對話導致改善結果漏顯示，已補上 ChatPanel 的 improvementCard，重新驗證通過。Windows 測試 helper 曾遺留子服務，確認專屬測試 command line 後停止並以新 DB 重跑；未操作共用服務。
- 真實 HTTP → Improver：`.env` 的 API_KEY、gpt-4.1-mini；接受後改善與全部拒絕改善各一次模型呼叫，兩者均 `provider=llm`、`ready`、intent revision 2、明確小尺寸長期偏好更新成功。使用合成文件與記憶體 DB，上游搜尋／議價仍離線；沒有付款或 child。

以下保留先前核心驗證的細節；表數與接線範圍以本段最新結果為準。

## 自動測試

| 執行 | 環境 | 實際結果 |
| --- | --- | --- |
| 根目錄 `npm test` | Node 24.13.0 | 通過：contracts、DB、orchestrator、Seller policies、unit、negotiation、evaluator、formatter、runtime 及新增 Improver 測試 |
| 根目錄 `npm run test:improver`（最後新增版本競爭案例後） | Node 24.13.0 | 31 個核心測試＋1 個 runtime 整合測試通過；backend build 通過 |
| backend `npx --yes --package=node@20.19.5 node node_modules/vitest/vitest.mjs run` | Node 20.19.5 | 4 個檔案、67 個測試全部通過，包括 31 個 Improver 測試與既有 Result API 回歸 |
| backend `npx --yes --package=node@20.19.5 node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | Node 20.19.5 | 通過；包含新增 TypeScript demo script |
| `npx --yes @fission-ai/openspec@1.13.0 validate add-buyer-request-improver --strict` | 本機 | Change valid |

核心驗證涵蓋：本次預算變更、明確長期小尺寸偏好、無原因拒絕、偽引文、錯誤 scope、單次偏好、schema extra fields、文件長度、完整 diff、硬条件漂移與 DB 繼承硬要求保留；穩定商務簽章；偏好局部替換／撤銷；重複工作、兩次模型預算、忽略 abort 的 provider、失效 lease、兩次領取上限、同條目衝突、無關更新 rebase、第二次衝突改存草稿、交易 rollback、舊 DB migration 備份及重啟恢復。

DB migration 後 integrity_check=ok、foreign_key_check=clean，共 30 個表。原測試硬編碼 27 個表，已同步新增的三個 Improver 表並增加逐表存在檢查；保留舊報價、決策與發布快照的測試通過。

## 真實 LLM 呼叫

金鑰來源：使用者既有 `.env` 的 API_KEY。沒有將金鑰寫入原始碼、測試報告、前端或新的設定檔。模型 gpt-4.1-mini，Responses API、store=false、strict JSON Schema。只送出合成測試文件與方案摘要。

backend `node --import tsx scripts/demo-improver.ts --live --inspect`（以 Node 20.19.5 執行）：

| 案例 | 回饋 | 觀測結果 |
| --- | --- | --- |
| purchase_only | 這次預算改成 800 元 | 一次模型呼叫；ready；intent 預算 1000 → 800；preference_updated=false |
| explicit_long_term | 這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。 | 一次模型呼叫；ready；intent 加入小尺寸；preference_updated=true，scope=category:mouse |

根目錄 `node backend/runtime/demo-improver.mjs --live`（先 build backend）：

- Node 24 的實際 RuntimeStore 執行離線 Formatter／搜尋／議價／Evaluator，得到 7 筆 ranked offers。
- 保存真實 SQLite reject，再經內部 adapter 呼叫真實 Improver LLM。
- 一次模型呼叫回 ready、provider=llm，intent 文件 revision=2，preference revision=1、preference_updated=true。
- 輸出 intent：`無線靜音滑鼠，預算 800 元，7天內到貨。`，另加 `偏好小尺寸`。
- 使用記憶體 DB；沒有實際付款、兌換或自動 child。此測試證明「runtime 內部交接＋真實 Improver」，不代表全部模型議價也使用真實 API。

初次 live 驗證曾收到 HTTP 400：Structured Outputs 的 const/enum leaf 缺少明確 type。已修正並加入 schema leaf 回歸測試。另觀測到模型可忽略明示長期偏好而選 keep；provider 現在依 Backend 可驗證的長期表述限制提案分支，所有 operations 仍須逐項驗證才可寫入。最後成功結果均為 provider=llm，不是 fallback。

## 尚未驗收

- 澄清問題的再次提交與完整下一輪瀏覽器流程。
- 全域偏好編輯器、既有 user_preferences 投影，以及分類偏好與後續 Request 的全站繼承。
- ready → child、澄清後提交與瀏覽器自動下一輪。

以上未完成項目在 tasks.md 保持未勾選；本 change 不 archive。
