# 五種銷售偏好的協商 E2E 結果

執行時間：2026-09-12T05:07:20.072Z；模式：offline；模型：gpt-4.1-mini-2025-04-14；耗時：0.09 秒。

**PASS**：15/15 項檢查通過。5 家 Seller，7 個最終 Offer，結果狀態 evaluating。

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

- standalone：offer_2e86525d-d9d7-4ba1-8762-9a2d84c2e390，有效期限 2026-09-12T05:17:20.225Z

### seller_b — 快速配送

以一天到貨為優勢，保留較高售價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$769 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$710 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$710 | deterministic / deterministic |
| 4 | NT$569 | 單買 NT$710 | deterministic / deterministic |
| 5 | NT$559 | 單買 NT$710 | deterministic / deterministic |

- standalone：offer_9eca7044-a541-459b-8813-b7509b4e4330，有效期限 2026-09-12T05:17:20.224Z

### seller_c — 免費送周邊

提供單買與同價贈送滑鼠墊，贈品可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$669 / 組合 NT$669 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 4 | NT$569 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |
| 5 | NT$559 | 單買 NT$610 / 組合 NT$610 | deterministic / deterministic |

- standalone：offer_2ec7386d-cb60-4a7b-bbe0-a3892a401ace，有效期限 2026-09-12T05:17:20.226Z
- bundle：offer_8cb29383-e51b-4cc8-bfc3-6b2801eefd10，有效期限 2026-09-12T05:17:20.226Z

### seller_d — 組合更便宜

滑鼠加滑鼠墊比同輪單買便宜 NT$30，配件可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 / 組合 NT$649 | deterministic / deterministic |
| 2 | NT$599 | 單買 NT$630 / 組合 NT$600 | deterministic / deterministic |
| 3 | NT$584 | 單買 NT$630 / 組合 NT$600 | deterministic / deterministic |

- standalone：offer_a7a79ad4-5317-4222-b9fa-5f6ebf03b7e8，有效期限 2026-09-12T05:17:20.209Z
- bundle：offer_c667663a-2670-4466-9035-0a6d158708bd，有效期限 2026-09-12T05:17:20.209Z

### seller_e — 固定價格

維持 NT$679，不跟價，第一輪報最終價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 | deterministic / deterministic |

- standalone：offer_7757131a-8563-4730-a0c2-960c12c45efa，有效期限 2026-09-12T05:17:20.176Z

## 模型與 fallback

HTTP 呼叫：0；API 已回報 token：0；保守預留 token：0。採用模型決策 0 次，fallback 38 次。

- seller_b 第 1 輪 buyer：model_unavailable_or_invalid
- seller_b 第 1 輪 seller：model_unavailable_or_invalid
- seller_d 第 1 輪 buyer：model_unavailable_or_invalid
- seller_d 第 1 輪 seller：model_unavailable_or_invalid
- seller_e 第 1 輪 buyer：model_unavailable_or_invalid
- seller_e 第 1 輪 seller：model_unavailable_or_invalid
- seller_a 第 1 輪 buyer：model_unavailable_or_invalid
- seller_a 第 1 輪 seller：model_unavailable_or_invalid
- seller_c 第 1 輪 buyer：model_unavailable_or_invalid
- seller_c 第 1 輪 seller：model_unavailable_or_invalid
- seller_b 第 2 輪 buyer：model_unavailable_or_invalid
- seller_b 第 2 輪 seller：model_unavailable_or_invalid
- seller_d 第 2 輪 buyer：model_unavailable_or_invalid
- seller_d 第 2 輪 seller：model_unavailable_or_invalid
- seller_a 第 2 輪 buyer：model_unavailable_or_invalid
- seller_a 第 2 輪 seller：model_unavailable_or_invalid
- seller_c 第 2 輪 buyer：model_unavailable_or_invalid
- seller_c 第 2 輪 seller：model_unavailable_or_invalid
- seller_b 第 3 輪 buyer：model_unavailable_or_invalid
- seller_b 第 3 輪 seller：model_unavailable_or_invalid
- seller_d 第 3 輪 buyer：model_unavailable_or_invalid
- seller_d 第 3 輪 seller：model_unavailable_or_invalid
- seller_a 第 3 輪 buyer：model_unavailable_or_invalid
- seller_a 第 3 輪 seller：model_unavailable_or_invalid
- seller_c 第 3 輪 buyer：model_unavailable_or_invalid
- seller_c 第 3 輪 seller：model_unavailable_or_invalid
- seller_b 第 4 輪 buyer：model_unavailable_or_invalid
- seller_b 第 4 輪 seller：model_unavailable_or_invalid
- seller_a 第 4 輪 buyer：model_unavailable_or_invalid
- seller_a 第 4 輪 seller：model_unavailable_or_invalid
- seller_c 第 4 輪 buyer：model_unavailable_or_invalid
- seller_c 第 4 輪 seller：model_unavailable_or_invalid
- seller_b 第 5 輪 buyer：model_unavailable_or_invalid
- seller_b 第 5 輪 seller：model_unavailable_or_invalid
- seller_a 第 5 輪 buyer：model_unavailable_or_invalid
- seller_a 第 5 輪 seller：model_unavailable_or_invalid
- seller_c 第 5 輪 buyer：model_unavailable_or_invalid
- seller_c 第 5 輪 seller：model_unavailable_or_invalid

## 自動驗證

- [x] 需求文件經 Format 與實際 Discovery 選出五家，執行紀錄已持久化
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
