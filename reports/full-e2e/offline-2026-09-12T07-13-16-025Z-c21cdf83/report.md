# Orchestrator → 協商 → Evaluator 完整測試

執行時間：2026-09-12T07:13:16.025Z；模式：offline；模型：gpt-4.1-mini-2025-04-14；耗時：0.4 秒。

買家偏好：價格優先。

**PASS**：23/23 項檢查通過。5 家 Seller，6 個最終 Offer，結果狀態 awaiting_user。

範圍：文字需求 → 規則 Formatter → SQLite → 既有 handoff.prepare／Discovery → 五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。另包含獨立 Evaluator 排序。不包含 HTTP／UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・清庫型 Price Optimizer | NT$549 | — | 5 天 | 5 | seller_final |
| seller_c・組合型 Bundle Curator | NT$619 | NT$649 | 3 天 | 3 | seller_final |
| seller_d・關係型 Loyalty Builder | NT$709 | — | 2 天 | 3 | seller_final |
| seller_b・履約型 Speed Seller | NT$799 | — | 1 天 | 3 | seller_final |
| seller_e・服務型 Margin Guardian | NT$899 | — | 4 天 | 3 | seller_final |

展示設定：A 清庫、B 物流、C 組合／贈品折現、D 回購權益、E 售後服務。未來券不扣本次價格；權益均為已登錄的模擬履約。C 加價組合須另行授權；本報告依 Evaluator 排名呈現五個賣家方案，完整 Offer 排名如下。金額都是模擬商家含稅運 TWD。

## Evaluator 排名

來源：deterministic_fallback；模型：offline；耗時 0.04 秒；呼叫 0 次；API tokens 0；fallback：model_unconfigured。

| 排名 | Seller | 選項 | 含稅運 | 到貨 | 原因 |
| --- | --- | --- | ---: | --- | --- |
| 1 | seller_a | standalone | NT$549 | 5 天 | 依價格優先排序；含稅運 NT$549，5 天到貨。 |
| 2 | seller_c | standalone | NT$619 | 3 天 | 依價格優先排序；含稅運 NT$619，3 天到貨。 |
| 3 | seller_d | standalone | NT$709 | 2 天 | 依價格優先排序；含稅運 NT$709，2 天到貨。 |
| 4 | seller_b | standalone | NT$799 | 1 天 | 依價格優先排序；含稅運 NT$799，1 天到貨。 |
| 5 | seller_e | standalone | NT$899 | 4 天 | 依價格優先排序；含稅運 NT$899，4 天到貨。 |

## 每輪協商

以下對話由實際結構化決策產生，非模型逐字稿；正式條件以 Backend 驗證的 Offer 為準。

### seller_a — 清庫型 Price Optimizer

加速指定黑色 SKU 周轉；每輪小幅讓價，報價 120 秒有效。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$609（5 天到貨）。 單買 NT$609 | deterministic / deterministic |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$579。 | 目標價無法達成，提供以下還價。單買 NT$594（5 天到貨）。 單買 NT$594 | deterministic / deterministic |
| 3 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$564。 | 目標價無法達成，提供以下還價。單買 NT$579（5 天到貨）。 單買 NT$579 | deterministic / deterministic |
| 4 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$549。 | 目標價無法達成，提供以下還價。單買 NT$564（5 天到貨）。 單買 NT$564 | deterministic / deterministic |
| 5 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$534。 | 目標價無法達成，提供以下還價。單買 NT$549（5 天到貨）。這是最終報價。 單買 NT$549 | deterministic / deterministic |

- standalone：offer_f5e0226b-f4e3-4e8c-a858-47691813225e，有效期限 2026-09-12T07:15:16.400Z

### seller_c — 組合型 Bundle Curator

第二輪可加贈相關滑鼠墊；放棄贈品最多額外折讓 30 元，不默認付費加購。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$669（3 天到貨）。 單買 NT$669 | deterministic / deterministic |
| 2 | 能否同價加送一張滑鼠墊，希望總價不超過 NT$669。 | 可以滿足這次條件。單買 NT$659（3 天到貨）；含滑鼠墊 NT$659（3 天到貨）。 單買 NT$659 / 組合 NT$659 | deterministic / deterministic |
| 3 | 如果取消滑鼠墊，可以換成額外折扣嗎，希望總價不超過 NT$629。 | 可以滿足這次條件。單買 NT$619（3 天到貨）；含滑鼠墊 NT$649（3 天到貨）。本輪取消贈品額外折讓 NT$30。這是最終報價。 單買 NT$619 / 組合 NT$649（需加價授權） | deterministic / deterministic |

- standalone：offer_ccdab1d1-e10b-44ac-836e-c6fa8fc7ea06，有效期限 2026-09-12T07:23:16.368Z
- bundle：offer_3c59e400-7168-4b5c-8cbb-643d4fc36afd，有效期限 2026-09-12T07:23:16.368Z

### seller_d — 關係型 Loyalty Builder

維持本次售價，提供下次券與較長退貨期，未來券不折抵本次总價。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。 單買 NT$709 | deterministic / deterministic |
| 2 | 可以提供下次購物券嗎。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。另含：下次購物券 NT$50（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$709 | deterministic / deterministic |
| 3 | 可以提供較長退貨期嗎。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。另含：下次購物券 NT$50、退貨期延長至 30 天（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$709 | deterministic / deterministic |

- standalone：offer_e12d9407-6455-4edb-92c3-c59161d7b785，有效期限 2026-09-12T07:23:16.366Z

### seller_b — 履約型 Speed Seller

維持物流溢價，以已登錄的一天到貨承諾及晚到補償換取成交。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。 單買 NT$799 | deterministic / deterministic |
| 2 | 可以提供到貨承諾嗎。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。另含：一天到貨承諾（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$799 | deterministic / deterministic |
| 3 | 可以提供晚到補償嗎。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。另含：一天到貨承諾、晚到補償 NT$50（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$799 | deterministic / deterministic |

- standalone：offer_ceaf6090-58ed-46e9-919e-25bc1e0e5686，有效期限 2026-09-12T07:23:16.370Z

### seller_e — 服務型 Margin Guardian

維持毛利，以已登錄保固、優先客服及換貨承諾提供售後保障。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | deterministic / deterministic |
| 2 | 可以提供優先客服嗎。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天、優先客服，一天內回覆（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | deterministic / deterministic |
| 3 | 可以提供瑕疵換貨保障嗎。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天、優先客服，一天內回覆、30 天內瑕疵換貨（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$899 | deterministic / deterministic |

- standalone：offer_dedb45c1-d24f-44db-b79c-ecfeefa91260，有效期限 2026-09-12T07:23:16.375Z

## 模型與 fallback

HTTP 呼叫：0；API 已回報 token：0；保守預留 token：0。採用模型決策 0 次，fallback 34 次。

- seller_a 第 1 輪 buyer：model_unavailable_or_invalid
- seller_a 第 1 輪 seller：model_unavailable_or_invalid
- seller_d 第 1 輪 buyer：model_unavailable_or_invalid
- seller_d 第 1 輪 seller：model_unavailable_or_invalid
- seller_c 第 1 輪 buyer：model_unavailable_or_invalid
- seller_c 第 1 輪 seller：model_unavailable_or_invalid
- seller_b 第 1 輪 buyer：model_unavailable_or_invalid
- seller_b 第 1 輪 seller：model_unavailable_or_invalid
- seller_e 第 1 輪 buyer：model_unavailable_or_invalid
- seller_e 第 1 輪 seller：model_unavailable_or_invalid
- seller_a 第 2 輪 buyer：model_unavailable_or_invalid
- seller_a 第 2 輪 seller：model_unavailable_or_invalid
- seller_d 第 2 輪 buyer：model_unavailable_or_invalid
- seller_d 第 2 輪 seller：model_unavailable_or_invalid
- seller_c 第 2 輪 buyer：model_unavailable_or_invalid
- seller_c 第 2 輪 seller：model_unavailable_or_invalid
- seller_b 第 2 輪 buyer：model_unavailable_or_invalid
- seller_b 第 2 輪 seller：model_unavailable_or_invalid
- seller_e 第 2 輪 buyer：model_unavailable_or_invalid
- seller_e 第 2 輪 seller：model_unavailable_or_invalid
- seller_a 第 3 輪 buyer：model_unavailable_or_invalid
- seller_a 第 3 輪 seller：model_unavailable_or_invalid
- seller_d 第 3 輪 buyer：model_unavailable_or_invalid
- seller_d 第 3 輪 seller：model_unavailable_or_invalid
- seller_c 第 3 輪 buyer：model_unavailable_or_invalid
- seller_c 第 3 輪 seller：model_unavailable_or_invalid
- seller_b 第 3 輪 buyer：model_unavailable_or_invalid
- seller_b 第 3 輪 seller：model_unavailable_or_invalid
- seller_e 第 3 輪 buyer：model_unavailable_or_invalid
- seller_e 第 3 輪 seller：model_unavailable_or_invalid
- seller_a 第 4 輪 buyer：model_unavailable_or_invalid
- seller_a 第 4 輪 seller：model_unavailable_or_invalid
- seller_a 第 5 輪 buyer：model_unavailable_or_invalid
- seller_a 第 5 輪 seller：model_unavailable_or_invalid

## 自動驗證

- [x] 文字需求經 Formatter 轉換並保留價格／售後優先權
- [x] 遠端 handoff.prepare 實際選出五家，計畫與 Discovery 已保存並可重播
- [x] 輸出契約與五家分支狀態正確
- [x] 五家皆有合格方案，未授權的組合另行保留
- [x] 每輪只使用上一個已提交 context
- [x] RFQ 無競爭者 ID／私有資料，所有競爭條件有真實來源
- [x] 最終報價符合金額、期限、庫存、SKU、數量與交期硬限制
- [x] A 有讓價，B 保持最快配送
- [x] C 曾提供免費滑鼠墊；折現後的加價方案不冒充免費
- [x] Discovery 公開條件匹配，不公開成本或靠 Persona 標籤加分
- [x] B／D／E 保護售價，分別提供物流、回購與售後權益
- [x] 每筆權益來自可用且有模擬履約證據的 Catalog；未來券不抵本次價格
- [x] 條件交換有實際對應回覆，取消贈品折讓累計不超過 NT$30
- [x] 最終 Offer ID 唯一，Evaluator ID 集合完整
- [x] 離線模式完全不呼叫 API
- [x] 執行未超過固定模型呼叫與 token 預留上限
- [x] SQLite Offer 不可變且完整持久化
- [x] Evaluator 排完全部合格 ID，產生五個賣家方案並符合指定偏好
- [x] Evaluator 離線備援不呼叫模型
- [x] Evaluator 發布快照不可修改，Sponsored 未改變推薦
- [x] 關閉／重開 SQLite 後重播同一結果，不再付模型費用
- [x] 其他買家無法讀取執行結果
- [x] Evaluator 關閉／重開 SQLite 後保持相同排名與原因

本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。
