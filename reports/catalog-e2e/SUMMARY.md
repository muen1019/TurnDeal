# 全商品談判政策與完整流程測試

日期：2026-09-12。前版已推送 main：a69ce8f；本報告對應接續的 Catalog 政策補齊。

## 資料庫結果

data/app.sqlite 與原 data/negotiation.sqlite 均已實際補入：20 個 Seller、20 個 Persona、129 筆庫存、129 份 SKU 政策，以及 120 筆原始 listing → 獨立 SKU 綁定。Foreign key check 為 0 個錯誤。原 negotiation.sqlite 已先建立本機備份；資料庫與備份均不提交 Git。

Discovery 15 家／120 筆商品全部有政策（90 支滑鼠、30 張滑鼠墊）；另有原五家／9 筆庫存。原 canonical 非活動的三款顏色只補政策，不自動加入其他 SKU 的促銷／服務範圍。各費用、Persona 與履約證據均為 synthetic，不是假稱爬取的商家條件。

## 自動測試

完整 npm test：142 個 Node test + 31 個 Improver Vitest，共 173 個測試通過；契約、fixture、SQLite migration / foreign key 檢查通過。包含最新远端 ACP 購買與 Buyer 改寫流程回歸。後端 TypeScript 建置通過。專案沒有設定 lint script，未宣稱 lint 已通過。

新增測試涵蓋：

- 所有 Seller/SKU 經正式 Repository 載入後有政策；原價、庫存及已發布快照保持原值。
- 重複 seed 不恢復已使用的庫存／權益額度，同版本更改內容會拒絕。
- 第一张滑鼠墊交期不符時，Seller 可選用第二張同賣家、同條款、符合成本白名單的滑鼠墊。
- 完整 Runtime 對價格優先／售後優先需求，從擴充 Catalog 自然選出五家且完成排名；結果不含私有底價或成本。

## 完整 HTTP E2E

| 模式 | 偏好 | 結果 | 報告 |
| --- | --- | --- | --- |
| 離線 | 價格優先 | 6/6 檢查，五家合格方案 | [對話與排名](offline-price-2026-09-12T07-40-40-234Z/report.html) |
| 離線 | 售後優先 | 6/6 檢查，五家合格方案 | [對話與排名](offline-service-2026-09-12T07-40-41-592Z/report.html) |
| 真實模型 | 售後優先 | 6/6 檢查，17.49 秒，五家合格方案 | [完整逐輪對話](live-service-2026-09-12T07-40-54-188Z/report.html) |

E2E 以 localhost HTTP POST 建立 Request，呼叫同一 Runtime 的 process，執行 Formatter → Discovery → Buyer/Seller → Backend 驗證 → Evaluator，再以 HTTP GET 讀取結果；並驗證 POST 冪等重送與流程重播。此測試不包含瀏覽器操作購物 UI 或使用者接受／付款；ACP 流程另由 root runtime/purchase 測試覆蓋。

Live 使用真實 Formatter、15 次 Buyer 與 15 次 Seller 回覆，Evaluator 使用真實模型且沒有 fallback；協商 30 次模型回覆也沒有 fallback。離線模式刻意不配置模型，以 deterministic fallback 驗證可重播性，不能將其 fallback 數字當作 API 故障。

### Live 售後優先結果

| 排名 | Seller | Persona | 含稅運總價 | 交期 |
| --- | --- | --- | ---: | ---: |
| 1 | discovery_seller_10 | 服務型 | 689 | 3 天 |
| 2 | seller_e | 服務型 | 899 | 4 天 |
| 3 | discovery_seller_05 | 服務型 | 719 | 5 天 |
| 4 | seller_b | 履約型 | 799 | 1 天 |
| 5 | discovery_seller_08 | 組合型 | 479 | 1 天 |

前三名皆有實際談成的 730 天保固、優先客服與 30 天瑕疵換貨。排名使用使用者偏好與正式 Offer 權益；不以 Persona 名稱加分。相同服務分數再依其他有效偏好／既有 tie-break 比較，售後優先不等於價格由低到高。

正常需求可能選中重複 Persona；本次售後優先自然選中三家服務型。若要展示五種 Persona 各一家，可用原本五家固定 Demo／personas 測試；正式探索不會為湊類型替换合格名次。

HTML 報告已加入 5 家 × 3 輪對話與 Seller 原始回覆，使用 Chromium 檢查有 5 個 Seller 區塊、15 輪、無水平溢出；[畫面預覽](live-service-2026-09-12T07-40-54-188Z/report-preview.png)。報告中的商品方案有測試時效，只供觀察協商結果，不是仍可購買的報價。
