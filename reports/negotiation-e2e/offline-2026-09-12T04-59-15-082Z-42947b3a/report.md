# 五種銷售偏好的協商 E2E 結果

執行時間：2026-09-12T04:59:15.082Z；模式：offline；模型：gpt-4.1-mini-2025-04-14；耗時：0.1 秒。

**PASS**：14/14 項檢查通過。5 家 Seller，7 個最終 Offer，結果狀態 evaluating。

範圍：已選定的五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。不包含尚未接上的需求解析、Discovery、Evaluator 排序、UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・願意讓價 | NT$549 | — | 5 天 | 5 | max_rounds |
| seller_b・快速配送 | NT$710 | — | 1 天 | 5 | max_rounds |
| seller_c・免費送周邊 | NT$610 | NT$610 | 3 天 | 5 | max_rounds |
| seller_d・組合更便宜 | NT$630 | NT$600 | 2 天 | 3 | seller_final |
| seller_e・固定價格 | NT$679 | — | 4 天 | 1 | seller_final |

展示設定：C 同價免費贈品；D 組合包含滑鼠墊且便宜 NT$30。單買與組合各有獨立 Offer ID，因此五張卡片可能有七個 Offer；這是按賣家分組的展示，不是 Evaluator 推薦排名。金額都是模擬商家含稅運 TWD。

## 每輪協商

### seller_a — 願意讓價

逐輪降價，優先匹配競爭價格，配送較慢。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$599 | deterministic / deterministic |
| 2 | NT$669 | 單買 NT$584 | deterministic / deterministic |
| 3 | NT$610 | 單買 NT$569 | deterministic / deterministic |
| 4 | NT$610 | 單買 NT$559 | deterministic / deterministic |
| 5 | NT$610 | 單買 NT$549 | deterministic / deterministic |

- standalone：offer_501a08c5-3bf9-4b29-aec0-6059013ead03，有效期限 2026-09-12T05:09:15.239Z

### seller_b — 快速配送

以一天到貨為優勢，保留較高售價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$769 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$710 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$710 | deterministic / deterministic |
| 4 | NT$569 | 單買 NT$710 | deterministic / deterministic |
| 5 | NT$559 | 單買 NT$710 | deterministic / deterministic |

- standalone：offer_5f2ad4e2-d692-42fd-8013-6e1f8cddc692，有效期限 2026-09-12T05:09:15.240Z

### seller_c — 免費送周邊

提供單買與同價贈送滑鼠墊，贈品可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$669 / 組合 NT$669 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 4 | NT$569 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 5 | NT$559 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |

- standalone：offer_60386398-a49c-4cc1-b0ba-db0d1fcac38e，有效期限 2026-09-12T05:09:15.240Z
- bundle：offer_fe61395a-5c5a-491c-b8ce-83c57f35985a，有效期限 2026-09-12T05:09:15.240Z

### seller_d — 組合更便宜

滑鼠加滑鼠墊比同輪單買便宜 NT$30，配件可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 / 組合 NT$649 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$630 / 組合 NT$600 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$630 / 組合 NT$600 | deterministic / deterministic |

- standalone：offer_633eb8dd-4202-4c81-8cc3-dd169011ee85，有效期限 2026-09-12T05:09:15.224Z
- bundle：offer_7fa00ffc-0023-479d-b61a-14a8952256e4，有效期限 2026-09-12T05:09:15.224Z

### seller_e — 固定價格

維持 NT$679，不跟價，第一輪報最終價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 | deterministic / deterministic |

- standalone：offer_e50e0019-5435-4c0c-bd5c-df5daeaf5d6e，有效期限 2026-09-12T05:09:15.186Z

## 模型與 fallback

HTTP 呼叫：0；API 已回報 token：0；保守預留 token：0。採用模型決策 0 次，fallback 38 次。

- seller_a 第 1 輪 buyer：model_unavailable_or_invalid
- seller_a 第 1 輪 seller：model_unavailable_or_invalid
- seller_d 第 1 輪 buyer：model_unavailable_or_invalid
- seller_d 第 1 輪 seller：model_unavailable_or_invalid
- seller_b 第 1 輪 buyer：model_unavailable_or_invalid
- seller_b 第 1 輪 seller：model_unavailable_or_invalid
- seller_e 第 1 輪 buyer：model_unavailable_or_invalid
- seller_e 第 1 輪 seller：model_unavailable_or_invalid
- seller_c 第 1 輪 buyer：model_unavailable_or_invalid
- seller_c 第 1 輪 seller：model_unavailable_or_invalid
- seller_a 第 2 輪 buyer：model_unavailable_or_invalid
- seller_a 第 2 輪 seller：model_unavailable_or_invalid
- seller_d 第 2 輪 buyer：model_unavailable_or_invalid
- seller_d 第 2 輪 seller：model_unavailable_or_invalid
- seller_b 第 2 輪 buyer：model_unavailable_or_invalid
- seller_b 第 2 輪 seller：model_unavailable_or_invalid
- seller_c 第 2 輪 buyer：model_unavailable_or_invalid
- seller_c 第 2 輪 seller：model_unavailable_or_invalid
- seller_a 第 3 輪 buyer：model_unavailable_or_invalid
- seller_a 第 3 輪 seller：model_unavailable_or_invalid
- seller_d 第 3 輪 buyer：model_unavailable_or_invalid
- seller_d 第 3 輪 seller：model_unavailable_or_invalid
- seller_b 第 3 輪 buyer：model_unavailable_or_invalid
- seller_b 第 3 輪 seller：model_unavailable_or_invalid
- seller_c 第 3 輪 buyer：model_unavailable_or_invalid
- seller_c 第 3 輪 seller：model_unavailable_or_invalid
- seller_a 第 4 輪 buyer：model_unavailable_or_invalid
- seller_a 第 4 輪 seller：model_unavailable_or_invalid
- seller_b 第 4 輪 buyer：model_unavailable_or_invalid
- seller_b 第 4 輪 seller：model_unavailable_or_invalid
- seller_c 第 4 輪 buyer：model_unavailable_or_invalid
- seller_c 第 4 輪 seller：model_unavailable_or_invalid
- seller_a 第 5 輪 buyer：model_unavailable_or_invalid
- seller_a 第 5 輪 seller：model_unavailable_or_invalid
- seller_b 第 5 輪 buyer：model_unavailable_or_invalid
- seller_b 第 5 輪 seller：model_unavailable_or_invalid
- seller_c 第 5 輪 buyer：model_unavailable_or_invalid
- seller_c 第 5 輪 seller：model_unavailable_or_invalid

## 自動驗證

- [x] 輸出契約與五家分支狀態正確
- [x] 五家皆提供可履約方案，交給 Evaluator
- [x] 每輪只使用上一個已提交 context
- [x] RFQ 無競爭者 ID／私有資料，所有競爭條件有真實來源
- [x] 最終報價符合金額、期限、庫存、SKU、數量與交期硬限制
- [x] A 有讓價，B 保持最快配送
- [x] C 免費周邊與 D 組合便宜 NT$30 均實際出現
- [x] E 不接受模型降價，第一輪固定 NT$679
- [x] 最終 Offer ID 唯一，Evaluator ID 集合完整
- [x] 離線模式完全不呼叫 API
- [x] 執行未超過固定模型呼叫與 token 預留上限
- [x] SQLite Offer 不可變且完整持久化
- [x] 關閉／重開 SQLite 後重播同一結果，不再付模型費用
- [x] 其他買家無法讀取執行結果

本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。
