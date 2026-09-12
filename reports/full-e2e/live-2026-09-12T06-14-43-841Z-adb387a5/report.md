# Orchestrator → 協商 → Evaluator 完整測試

執行時間：2026-09-12T06:14:43.841Z；模式：live；模型：gpt-4.1-mini-2025-04-14；耗時：15.81 秒。

**FAIL**：19/21 項檢查通過。5 家 Seller，5 個最終 Offer，結果狀態 awaiting_user。

範圍：SQLite 已解析需求 → 遠端 handoff.prepare／Discovery → 五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。另包含獨立 Evaluator 排序。不包含 HTTP／UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・清庫型 Price Optimizer | NT$609 | — | 5 天 | 2 | no_adjustment |
| seller_c・組合型 Bundle Curator | NT$669 | — | 3 天 | 2 | no_adjustment |
| seller_d・關係型 Loyalty Builder | NT$709 | — | 2 天 | 3 | seller_final |
| seller_b・履約型 Speed Seller | NT$799 | — | 1 天 | 3 | seller_final |
| seller_e・服務型 Margin Guardian | NT$899 | — | 4 天 | 3 | seller_final |

展示設定：A 清庫、B 物流、C 組合／贈品折現、D 回購權益、E 售後服務。未來券不扣本次價格；權益均為已登錄的模擬履約。C 加價組合須另行授權；本報告依 Evaluator 排名呈現五個賣家方案，完整 Offer 排名如下。金額都是模擬商家含稅運 TWD。

## Evaluator 排名

來源：openai；模型：gpt-4.1-2025-04-14；耗時 2.69 秒；呼叫 1 次；API tokens 3060；fallback：無。

| 排名 | Seller | 選項 | 含稅運 | 到貨 | 原因 |
| --- | --- | --- | ---: | --- | --- |
| 1 | seller_a | standalone | NT$609 | 5 天 | 最低價，NT$609，配送天數 5 天。 |
| 2 | seller_c | standalone | NT$669 | 3 天 | 價格 NT$669，配送 3 天，比最低價貴 NT$60，但較快送達。 |
| 3 | seller_d | standalone | NT$709 | 2 天 | 價格 NT$709，配送 2 天，比最低價高 NT$100，送達較快。 |
| 4 | seller_b | standalone | NT$799 | 1 天 | 價格 NT$799，配送 1 天，比最低價高 NT$190，送達最快。 |
| 5 | seller_e | standalone | NT$899 | 4 天 | 價格 NT$899，配送 4 天，為所有報價最高。 |

## 每輪協商

以下對話由實際結構化決策產生，非模型逐字稿；正式條件以 Backend 驗證的 Offer 為準。

### seller_a — 清庫型 Price Optimizer

加速指定黑色 SKU 周轉；每輪小幅讓價，報價 120 秒有效。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$609（5 天到貨）。 單買 NT$609 | openai / openai |
| 2 | 目前沒有需要調整的條件，停止協商。 | no_adjustment no_adjustment | — / — |

- standalone：offer_f522d5ab-7958-41ea-9d73-3d2e8942a2ec，有效期限 2026-09-12T06:16:45.079Z

### seller_c — 組合型 Bundle Curator

第二輪可加贈相關滑鼠墊；放棄贈品最多額外折讓 30 元，不默認付費加購。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$669（3 天到貨）。 單買 NT$669 | openai / openai |
| 2 | 目前沒有需要調整的條件，停止協商。 | no_adjustment no_adjustment | — / — |

- standalone：offer_9dda2da8-de36-4855-89eb-73ca0e2ecab2，有效期限 2026-09-12T06:24:45.426Z

### seller_d — 關係型 Loyalty Builder

維持本次售價，提供下次券與較長退貨期，未來券不折抵本次总價。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。 單買 NT$709 | openai / openai |
| 2 | 可以提供下次購物券嗎。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。另含：下次購物券 NT$50（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$709 | openai / openai |
| 3 | 可以提供較長退貨期嗎。 | 可以滿足這次條件。單買 NT$709（2 天到貨）。另含：下次購物券 NT$50、退貨期延長至 30 天（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$709 | openai / openai |

- standalone：offer_d6b9784c-69ee-407b-ae06-553bd3d5e9fd，有效期限 2026-09-12T06:24:55.159Z

### seller_b — 履約型 Speed Seller

維持物流溢價，以已登錄的一天到貨承諾及晚到補償換取成交。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。 單買 NT$799 | openai / openai |
| 2 | 可以提供到貨承諾嗎，希望總價不超過 NT$799。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。另含：一天到貨承諾（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$799 | openai / openai |
| 3 | 可以提供晚到補償嗎，希望總價不超過 NT$799。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。另含：一天到貨承諾、晚到補償 NT$50（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$799 | openai / openai |

- standalone：offer_f60187cc-04d0-42d4-9815-3fb1bc545c29，有效期限 2026-09-12T06:24:55.154Z

### seller_e — 服務型 Margin Guardian

維持毛利，以已登錄保固、優先客服及換貨承諾提供售後保障。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請再優惠一點（滑鼠單買）。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | openai / openai |
| 2 | 可以提供優先客服嗎，希望總價不超過 NT$899。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天、優先客服，一天內回覆（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | openai / openai |
| 3 | 可以提供瑕疵換貨保障嗎，希望總價不超過 NT$899。 | 可以滿足這次條件。單買 NT$899（4 天到貨）。另含：保固延長至 730 天、優先客服，一天內回覆、30 天內瑕疵換貨（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$899 | openai / openai |

- standalone：offer_b6944ebc-6fb1-4d54-a091-1363cc6b437e，有效期限 2026-09-12T06:24:54.997Z

## 模型與 fallback

HTTP 呼叫：24；API 已回報 token：33984；保守預留 token：199456。採用模型決策 22 次，fallback 0 次。

本次沒有 fallback。

## 自動驗證

- [x] 遠端 handoff.prepare 實際選出五家，計畫與 Discovery 已保存並可重播
- [x] 輸出契約與五家分支狀態正確
- [x] 五家皆有合格方案，未授權的組合另行保留
- [x] 每輪只使用上一個已提交 context
- [x] RFQ 無競爭者 ID／私有資料，所有競爭條件有真實來源
- [x] 最終報價符合金額、期限、庫存、SKU、數量與交期硬限制
- [x] A 有讓價，B 保持最快配送
- [ ] C 曾提供免費滑鼠墊；折現後的加價方案不冒充免費：Assertion failed; see sanitized result and round history.
- [x] B／D／E 保護售價，分別提供物流、回購與售後權益
- [x] 每筆權益來自可用且有模擬履約證據的 Catalog；未來券不抵本次價格
- [ ] 條件交換有實際對應回覆，取消贈品折讓累計不超過 NT$30：Assertion failed; see sanitized result and round history.
- [x] 最終 Offer ID 唯一，Evaluator ID 集合完整
- [x] Buyer 與 Seller 均實際成功使用真實模型
- [x] 執行未超過固定模型呼叫與 token 預留上限
- [x] SQLite Offer 不可變且完整持久化
- [x] Evaluator 排完全部合格 ID，產生五個賣家方案並符合價格優先
- [x] Evaluator 實際採用真實模型排序
- [x] Evaluator 發布快照不可修改，Sponsored 未改變推薦
- [x] 關閉／重開 SQLite 後重播同一結果，不再付模型費用
- [x] 其他買家無法讀取執行結果
- [x] Evaluator 關閉／重開 SQLite 後保持相同排名與原因

本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。
