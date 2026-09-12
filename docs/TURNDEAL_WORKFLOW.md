# TurnDeal：完整購買與 Improver 接線

2026-09-12。此文件是目前 UI workflow；先前 OfferMesh 名稱、舊 legacy refinement 文件保留作歷史紀錄。內部 API / SQLite / sessionStorage / preference marker 識別碼不因品牌更名改動，以免丟失原資料。

## 使用流程

1. `npm run dev:secure` 隱藏輸入 key，開 `http://127.0.0.1:5173/chat`。無 key 可用 `npm run dev` 離線測試。
2. 設定基本資料／偏好 → 輸入需求 → Formatter → 五個合格 Seller 議價 → 獨立推薦。
3. 左滑先在本分頁保存略過的 offer IDs；採用時一起送出 versioned selection。全部不合適可送出原因；不依行為猜測長期偏好。
4. 全部拒絕後顯示 PR #3 的 Improver 狀態，必要時輸入完整調整條件。後端保存新的改善工作並建立唯一 child，前端按「查看新一輪結果」讀取該 child；不再另呼叫 legacy refinement 建立第二個 child。
5. 採用只保存 offer。按「前往測試結帳」建立 purchase → 填姓名／email／地址／配送 → 儲存資料 → 顯示價格與資料確認 → 按「確認測試購買」→ 商家完成後顯示收據。

這是 ACP **測試商家與模擬付款**，不扣真實款、不出貨，不收卡號或支付密鑰。真正金流未配置。`npm run dev:mobile` 在 5174 提供完整離線流程（包含 Improver 與結帳），由 loopback 3202 提供獨立記憶體 SQLite API。每個瀏覽器的簽名 HttpOnly cookie 區隔 Demo 身分，重啟清空，不連原本資料庫或付費 LLM；僅限可信任 Wi-Fi。5173 仍為本機持久化／可接 LLM 的版本。

## API 對應

| UI | API |
|---|---|
| 採用／拒絕 | POST `/api/requests/{id}/decisions`，`selection_version:1`、`rejected_offer_ids` |
| 改善進度 | GET `/api/requests/{id}/improvement` |
| 回答改善追問 | POST `/api/requests/{id}/improvement/clarifications`，目前 improvement_id + 完整 feedback |
| 讀取下一輪 | 只使用回應中的 `next_request_id` 呼叫 GET `/api/requests/{id}` |
| 建立結帳 | POST `/api/requests/{id}/purchases` |
| 恢復結帳 | GET `/api/requests/{id}/purchase` |
| 儲存收件資料 | POST `/api/purchases/{id}/checkout` |
| 明確確認／取消 | POST `/api/purchases/{id}/complete` 或 `/cancel` |

每個 POST 有原操作的 Idempotency-Key。未知結果鎖定操作並提供核對；complete/create/cancel 的安全恢復日誌保存於 sessionStorage，重整後沿用原 body/key，不重新產生訂單。收件地址的未完成 update 只留記憶體，重整後讀回後端權威狀態，不把地址寫進瀏覽器 recovery journal。付款成功必須有 completed + 商家 order + 模擬成功標記，不能只靠按鈕或 HTTP 200 判定。

## Improver 合併細節

- PR #2 的購買後端與部分 Improver 已在先前主線；本次合併 PR #3（`510e843`，main merge `5cc2f64`）的澄清與下一輪工作流。
- 保留單輪模型選擇、request lineage、原始父請求、權重與不可變報價。新 child 使用提交版本的 frozen Formatter，不重新讀取後來變動的偏好。
- 修正整合時權重被當成商品硬條件比較的問題：權重獨立繼承，不能由模型修改。純文字語意比較不以是否存在 ranking_weights 判成未授權改寫。
- 離線 Improver 也保留原 request preference 在後續文件中；不會因切换全域版本而丟失原顏色／其他限制。驗證仍拒絕模型擅自刪掉黑色等硬條件。
- 長期偏好更新只接受有明確證據的支援句型。全域版本庫尚未取代 onboarding profile / user_preferences，新開一般需求的跨輪全域同步仍是獨立工作。不能宣稱每次左滑都自動學成長期偏好。

## 商品顏色

本機已有 129 個商品，`products.attributes_json.color` 全部有值：黑81、白16、粉16、藍15、紅1（含滑鼠墊）。不是缺資料，而是原 Offer items 只帶 SKU，UI 沒顯示顏色。

Migration `012_product_display.sql` 新增非破壞性 view，方便查閱，不修改原商品、價格、庫存或策略：

```sql
SELECT product_id, name, category, color, size_class
FROM product_catalog_display
WHERE category = 'mouse';
```

新 RequestSnapshot 的可選 `product_details` 保存公開 product_id/name/color，來源是該輪 catalog 快照，不含底價或私有策略。前端商品卡／明細／採用摘要使用這份資料。舊歷史快照不回填，缺少時顯示「顏色未提供」；開始新需求即可看到完整顏色。schema 共49張表，view 不計入表數。

## 畫面與驗證

- 品牌 TurnDeal；處理畫面改小字、藍色流光進度條、百分比和四階段指示。12/30/60/88 是階段估算；只有已完成推薦才100%，錯誤停止動畫。支援 reduced motion。
- `npm test`：契約／SQLite／搜尋／議價／Evaluator／Formatter／runtime／purchase／完整 Improver。
- `npm --prefix frontend test`、`npm --prefix frontend run build`。
- `node tests/turndeal-browser.mjs`（或舊入口 `tests/history-refinement-browser.mjs`）：隔離 SQLite、零付費呼叫、零真實付款；驗證追問→child→顏色→採用→結帳→丟失 complete 回應→重整→同 key 恢復唯一訂單，以及歷史清除／320–1440px 版面／動畫。可用 TEST_UI_ORIGIN 指定測試 Vite origin。
- 截圖在忽略的 `frontend/test-results/turndeal/`。本次新金流／Improver整合的 end-to-end 驗證使用離線策略，不宣稱已跑真實 LLM 議價全部分支。
