# Orchestrator → 協商 → Evaluator 完整測試

執行時間：2026-09-12T06:09:32.640Z；模式：live；模型：gpt-4.1-mini-2025-04-14；耗時：20.45 秒。

**FAIL**：19/21 項檢查通過。5 家 Seller，6 個最終 Offer，結果狀態 awaiting_user。

範圍：SQLite 已解析需求 → 遠端 handoff.prepare／Discovery → 五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。另包含獨立 Evaluator 排序。不包含 HTTP／UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・清庫型 Price Optimizer | NT$579 | — | 5 天 | 3 | token_budget |
| seller_c・組合型 Bundle Curator | NT$659 | NT$659 | 3 天 | 3 | token_budget |
| seller_d・關係型 Loyalty Builder | NT$709 | — | 2 天 | 3 | token_budget |
| seller_b・履約型 Speed Seller | NT$799 | — | 1 天 | 3 | seller_final |
| seller_e・服務型 Margin Guardian | NT$899 | — | 4 天 | 3 | token_budget |

展示設定：A 清庫、B 物流、C 組合／贈品折現、D 回購權益、E 售後服務。未來券不扣本次價格；權益均為已登錄的模擬履約。C 加價組合須另行授權；本報告依 Evaluator 排名呈現五個賣家方案，完整 Offer 排名如下。金額都是模擬商家含稅運 TWD。

## Evaluator 排名

來源：openai；模型：gpt-4.1-2025-04-14；耗時 3.66 秒；呼叫 1 次；API tokens 3161；fallback：無。

| 排名 | Seller | 選項 | 含稅運 | 到貨 | 原因 |
| --- | --- | --- | ---: | --- | --- |
| 1 | seller_a | standalone | NT$579 | 5 天 | 最低價，NT$579，運送 5 天。 |
| 2 | seller_c | standalone | NT$659 | 3 天 | 次低價，NT$659，運送 3 天。 |
| 3 | seller_c | bundle | NT$659 | 3 天 | 同價 NT$659，運送 3 天，為含滑鼠墊組合，依規定同價可列次於獨立品項。 |
| 4 | seller_d | standalone | NT$709 | 2 天 | 價格 NT$709，運送 2 天。 |
| 5 | seller_b | standalone | NT$799 | 1 天 | 價格 NT$799，運送最快 1 天。 |
| 6 | seller_e | standalone | NT$899 | 4 天 | 價格最高，NT$899，運送 4 天。 |

## 每輪協商

以下對話由實際結構化決策產生，非模型逐字稿；正式條件以 Backend 驗證的 Offer 為準。

### seller_a — 清庫型 Price Optimizer

加速指定黑色 SKU 周轉；每輪小幅讓價，報價 120 秒有效。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$609（5 天到貨）。 單買 NT$609 | deterministic / openai |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$580。 | 目標價無法達成，提供以下還價。單買 NT$594（5 天到貨）。 單買 NT$594 | openai / openai |
| 3 | 能否同價加送一張滑鼠墊，希望總價不超過 NT$594。 | 無法同意這項條件，仍可提供以下方案。單買 NT$579（5 天到貨）。 單買 NT$579 | deterministic / openai |

- standalone：offer_773acf89-a292-423e-971a-de52aca22d9a，有效期限 2026-09-12T06:11:47.301Z

### seller_c — 組合型 Bundle Curator

第二輪可加贈相關滑鼠墊；放棄贈品最多額外折讓 30 元，不默認付費加購。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$669（3 天到貨）。 單買 NT$669 | deterministic / openai |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$609。 | 目標價無法達成，提供以下還價。單買 NT$659（3 天到貨）；含滑鼠墊 NT$659（3 天到貨）。 單買 NT$659 / 組合 NT$659 | openai / openai |
| 3 | 如果取消滑鼠墊，可以換成額外折扣嗎，希望總價不超過 NT$629。 | token_budget token_budget | — / — |

- standalone：offer_9139165c-ceeb-4521-8996-032013c6c37d，有效期限 2026-09-12T06:19:40.960Z
- bundle：offer_e0d1fe3a-2c2f-49cd-9a39-eaa3bf715143，有效期限 2026-09-12T06:19:40.960Z

### seller_d — 關係型 Loyalty Builder

維持本次售價，提供下次券與較長退貨期，未來券不折抵本次总價。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$709（2 天到貨）。 單買 NT$709 | deterministic / openai |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$669。 | 目標價無法達成，提供以下還價。單買 NT$709（2 天到貨）。另含：下次購物券 NT$50（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$709 | openai / openai |
| 3 | 可以提供較長退貨期嗎。 | token_budget token_budget | — / — |

- standalone：offer_90d8a7dc-c91f-4075-8db4-ed32c19f883f，有效期限 2026-09-12T06:19:40.382Z

### seller_b — 履約型 Speed Seller

維持物流溢價，以已登錄的一天到貨承諾及晚到補償換取成交。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$799（1 天到貨）。 單買 NT$799 | deterministic / openai |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$709。 | 目標價無法達成，提供以下還價。單買 NT$799（1 天到貨）。另含：一天到貨承諾（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$799 | openai / openai |
| 3 | 可以提供晚到補償嗎。 | 可以滿足這次條件。單買 NT$799（1 天到貨）。另含：一天到貨承諾、晚到補償 NT$50（須符合各權益條件；未來優惠不抵本次價格）。這是最終報價。 單買 NT$799 | deterministic / openai |

- standalone：offer_2837b89c-428f-4371-9936-e7ed269d7e14，有效期限 2026-09-12T06:19:47.391Z

### seller_e — 服務型 Margin Guardian

維持毛利，以已登錄保固、優先客服及換貨承諾提供售後保障。

| 輪次 | Buyer 提出的條件 | Seller 正式回應 | 執行來源 Buyer／Seller |
| --- | --- | --- | --- |
| 1 | 請比較滑鼠單買與含滑鼠墊的價格。 | 無法同意這項條件，仍可提供以下方案。單買 NT$899（4 天到貨）。另含：保固延長至 730 天（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | deterministic / openai |
| 2 | 請再優惠一點（滑鼠單買），希望總價不超過 NT$609。 | 目標價無法達成，提供以下還價。單買 NT$899（4 天到貨）。另含：保固延長至 730 天、優先客服，一天內回覆（須符合各權益條件；未來優惠不抵本次價格）。 單買 NT$899 | openai / openai |
| 3 | 可以提供瑕疵換貨保障嗎。 | token_budget token_budget | — / — |

- standalone：offer_4038bbd4-3180-4a6b-9a57-1f2d332c20c4，有效期限 2026-09-12T06:19:41.107Z

## 模型與 fallback

HTTP 呼叫：27；API 已回報 token：44366；保守預留 token：245924。採用模型決策 17 次，fallback 7 次。

- seller_b 第 1 輪 buyer：model_unavailable_or_invalid
- seller_d 第 1 輪 buyer：model_unavailable_or_invalid
- seller_e 第 1 輪 buyer：model_unavailable_or_invalid
- seller_a 第 1 輪 buyer：model_unavailable_or_invalid
- seller_c 第 1 輪 buyer：model_unavailable_or_invalid
- seller_b 第 3 輪 buyer：model_unavailable_or_invalid
- seller_a 第 3 輪 buyer：model_unavailable_or_invalid
- seller_c 第 3 輪 buyer：model_unavailable_or_invalid

## 自動驗證

- [x] 遠端 handoff.prepare 實際選出五家，計畫與 Discovery 已保存並可重播
- [x] 輸出契約與五家分支狀態正確
- [x] 五家皆有合格方案，未授權的組合另行保留
- [x] 每輪只使用上一個已提交 context
- [x] RFQ 無競爭者 ID／私有資料，所有競爭條件有真實來源
- [x] 最終報價符合金額、期限、庫存、SKU、數量與交期硬限制
- [x] A 有讓價，B 保持最快配送
- [x] C 曾提供免費滑鼠墊；折現後的加價方案不冒充免費
- [ ] B／D／E 保護售價，分別提供物流、回購與售後權益：Assertion failed; see sanitized result and round history.
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
