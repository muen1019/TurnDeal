# UI 驗證紀錄

日期：2026-09-12 13:23（Asia/Taipei）。本輪驗證基於 commit 05d9230，使用 Node 20.19.5 與 v0.3 共用契約的真實 backend／SQLite。

## 已實跑

- `npm test`：12 個測試檔、81 個測試通過。
- `npm run build`：共用型別產生、TypeScript 與 Vite production build 通過。
- 根目錄 `npm run test:contracts` 通過。
- `npx @fission-ai/openspec validate define-offer-result-ui-api --strict` 通過；這是文件驗證，不代表所有裝置驗收完成。
- `npm run test:e2e`：Chromium → 5187 proxy → 3101 真實 API → 隔離 SQLite。操作儲存定義、中文需求送出、5 家賣家／6 組優惠、略過／撤回、2 件組合明細、採用及回饋；多尺寸版面與 reduced-motion 檢查通過，沒有 pageerror。
- `npm run test:api:e2e`：production build → 5188 preview proxy → 真實 API → 隔離 SQLite 通過。明確驗證兩次建立需求、一次 accept、一次 reject、feedback 前後空白與 source_documents 不變；前端請求只使用 OpenAPI 定義的三個路由。
- 已目視檢查本輪 chat-1536.png、offers-390.png、mobile-320x568-offers.png：文字與方案可讀，低高度操作按鈕仍在畫面內。
- Python Playwright 經目前 API 及隔離 SQLite 服務分別執行瀏覽器流程。最後一輪結果由 `test-results/e2e-result.json` 的 base 與 passed 欄位辨識。

## 瀏覽器檢查內容

| 項目 | 證據 |
| --- | --- |
| 真實 Chat 送出 | 經編輯器儲存、composer Enter、POST 202、GET awaiting_user；沒有用假成功取代送出 |
| 滑卡 | 滑鼠左拖、撤回、右拖採用；左滑無 decision POST，右滑只送一次 |
| 明細／恢復 | items 數量與回傳一致，採用與拒絕後 reload 由 GET 恢復 |
| 全略過 | 明確填寫回饋才拒絕，回傳文件與原始快照一致，無自動建立下一輪 |
| 版面 | 320／390／768／1440 × 1024、1536 × 1024、1536 × 668、390 × 668、320 × 568 |
| 整頁捲動 | document.scrollWidth／scrollHeight 不超過 viewport；shell 邊界為 (0, 0, width, height) |
| 共用外框 | Chat／offers／details 的 shell 與 main bounds 差距不超過 1 CSS pixel |
| 簡化內容 | 不顯示 request／offer／product／campaign／terms IDs、JSON、原始文件、交接或決策資料 |
| Reduced motion | 卡片拖曳保持置中；Escape 中斷後沒有決策 POST |
| 操作可達 | 低高度滑卡操作列仍位於 viewport 內，長內容使用元件內捲動 |

截圖與量測輸出於 `test-results/`（忽略版控）：chat-1536.png、offers-1536.png、offers-320.png、offers-390.png、mobile-320x568-offers.png、details-1536.png、accepted-reload.png、rejected-reload.png、reduced-motion-drag.png。

## 單元及元件驗證

涵蓋 Unicode 長度、中文 IME、鍵盤送出與文件分頁、草稿／版本保存失敗、400 回饋保留、格式與 ID 驗證、StrictMode 重播、未知提交與原 key 重試、Retry-After、晚到回應、25% 拖曳門檻、垂直手勢、多指／pointercancel、過期禁止採用、鍵盤零動畫與 Sponsored 不改排名。

## 尚未確認的專項驗收

未使用實體手機、原生行動軟鍵盤或 Safari；viewport 模擬不等同真機測試。尚未完整執行 200% 文字放大，以及動畫 0%／50%／100% × 全部失敗、逾時、expiry、request 切換的交叉矩陣。OpenSpec 中包含這些完整验收的任務仍保持未勾選，change 不 archive。

本次建立 public/images/ 的無品牌商品 SVG 示意；它們不是商品照片或商品屬性的來源。React、Vite、Motion、Lucide、Ajv、Vitest、Testing Library、Playwright 為既有開源依賴。
