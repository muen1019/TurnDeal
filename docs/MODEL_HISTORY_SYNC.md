# 模型選擇、歷史紀錄與整合（2026-09-12）

## 目前操作

- 左上方下拉選單：GPT-5.6 Sol（預設）、GPT-4.1、GPT-4.1 Mini。只影響新需求；正在執行或補充的需求沿用原模型。預覽模式仍不呼叫 LLM。
- `CreateRequest.model` 是白名單內的模型 ID，不接受 endpoint 或 key。SQLite `requests.llm_model` 凍結每輪選擇，`RequestSnapshot.model` 回報選擇，`formatter.provider/model` 回報解析實際來源。選到 Sol 不代表必定成功；API 失敗仍明確標示 fallback。
- 整合 Runtime 的 Formatter、Buyer/Seller、Evaluator、拒絕追問及 versioned Improver 沿用本輪模型。舊的獨立 CLI 範例保留各自模型參數，不能視為 Runtime 設定來源。
- Sol 使用 Responses API、Structured Outputs、`reasoning.effort: none`，保留既有 token／timeout／呼叫次數限制；不啟用 priority/pro。費用與延遲可能高於 Mini。Key 只在後端安全終端，不放進 UI 或 SQLite。
- 預算問句以欄位分類去重，將「最高可接受金額」也識別為預算；一般預算確認統一成輸入金額題，不同時要求「是」和金額。矛盾條件不直接丟棄。舊請求的不可變問題不重寫，請開始新需求測試。

## 清除範圍

側欄支援單筆、全部清除，皆須確認，可取消。清除的是當前分頁的 sessionStorage 對話／草稿，不清空整個瀏覽器，也不刪除個人設定、模型選擇、SQLite 請求、報價、決策、付款測試稽核。清除後回到一個空白對話；原 request URL 仍能讀取有權限的結果。處理中或結果不明時鎖定。這不是全帳號資料抹除功能。

## 本次遠端合併與資料庫

- 合併 origin/main `9a74f15`：保留 Seller Personas、SKU 議價／售後策略、ACP 測試結帳、versioned Improver，並接回本地 onboarding、偏好權重與拒絕問答。
- Runtime 使用 `data/app.sqlite`；不要用 `db:rebuild` 更新實際對話資料。啟動先 `VACUUM INTO` 備份，再套用缺少的完整檔名 migration，再執行版本化 catalog policy seed。不能重設原庫存／價格。
- 新 schema 共 48 張表；本機驗證有 20 位 Seller、129 筆 Product、130 筆庫存關聯、129 筆 SKU 策略。庫存關聯數不是商品種類數。原 discovery 測資仍保留。
- `007_buyer_profiles.sql` 與遠端 `007_gift_exchange.sql` 不衝突：migration 以完整檔名識別，不是只有數字。新增 `011_request_model.sql` 保存模型選擇。
- 手機目前使用 legacy reject → refinement → clarification → 新一輪篩選。遠端 Improver 只由帶 `selection_version: 1` 的選擇請求觸發；不能同時把同一 UI 回饋接到兩套流程，以免重複模型呼叫。前端尚未自動啟用 versioned 長期偏好學習或 ACP 付款。

## 驗證

`npm test`、`npm --prefix frontend test`、`npm --prefix frontend run build`、`node tests/history-refinement-browser.mjs`。
瀏覽器測試使用隔離 SQLite、零付費呼叫，涵蓋模型選擇、預算問答、拒絕後重新篩選、重整保留答案、手機側欄及單筆／全部刪除，檢查 320 / 390 / 430 / 1440 寬度。

2026-09-12 在安全終端啟動的本機服務實測「1000元滑鼠」：`formatter.provider=openai`、`formatter.model=gpt-5.6-sol`，產生一題預算與一題交期；未購買。此實測只證明 Formatter 真實呼叫成功，不代表所有議價分支都已做付費模型驗證。

官方相容性：[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)。
