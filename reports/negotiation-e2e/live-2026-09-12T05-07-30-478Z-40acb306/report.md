# 五種銷售偏好的協商 E2E 結果

執行時間：2026-09-12T05:07:30.478Z；模式：live；模型：gpt-4.1-mini-2025-04-14；耗時：13.01 秒。

**PASS**：15/15 項檢查通過。5 家 Seller，7 個最終 Offer，結果狀態 evaluating。

範圍：需求文件 → Format（展示語法）→ 實際 Discovery → 五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。尚不包含 Evaluator 排序。不包含 HTTP／UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・願意讓價 | NT$549 | — | 5 天 | 5 | max_rounds |
| seller_b・快速配送 | NT$710 | — | 1 天 | 3 | seller_final |
| seller_c・免費送周邊 | NT$610 | NT$610 | 3 天 | 3 | seller_final |
| seller_d・組合更便宜 | NT$630 | NT$600 | 2 天 | 3 | seller_final |
| seller_e・固定價格 | NT$679 | — | 4 天 | 1 | seller_final |

展示設定：C 同價免費贈品；D 組合包含滑鼠墊且便宜 NT$30。單買與組合各有獨立 Offer ID，因此五張卡片可能有七個 Offer；這是按賣家分組的展示，不是 Evaluator 推薦排名。金額都是模擬商家含稅運 TWD。

## 每輪協商

### seller_a — 願意讓價

逐輪降價，優先匹配競爭價格，配送較慢。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$590 | openai / openai |
| 2 | NT$679 | 單買 NT$584 | openai / openai |
| 3 | NT$610 | 單買 NT$569 | openai / openai |
| 4 | NT$610 | 單買 NT$549 | openai / openai |
| 5 | NT$610 | 單買 NT$549 | openai / openai |

- standalone：offer_7a607643-7d05-43ae-911e-9f56b29913bd，有效期限 2026-09-12T05:17:42.383Z

### seller_b — 快速配送

以一天到貨為優勢，保留較高售價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$769 | openai / openai |
| 2 | NT$669 | 單買 NT$720 | openai / openai |
| 3 | NT$610 | 單買 NT$710 | openai / openai |

- standalone：offer_d91e983c-3e95-4815-8eb6-6e744363f391，有效期限 2026-09-12T05:17:37.405Z

### seller_c — 免費送周邊

提供單買與同價贈送滑鼠墊，贈品可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$669 / 組合 NT$669 | openai / openai |
| 2 | NT$590 | 單買 NT$610 / 組合 NT$610 | openai / deterministic |
| 3 | NT$584 | 單買 NT$610 / 組合 NT$610 | openai / openai |

- standalone：offer_50cb7a6a-f8e9-4cdb-a50c-0dddb5ca2766，有效期限 2026-09-12T05:17:37.852Z
- bundle：offer_cb765648-ee89-4e89-ac48-214819921c07，有效期限 2026-09-12T05:17:37.852Z

### seller_d — 組合更便宜

滑鼠加滑鼠墊比同輪單買便宜 NT$30，配件可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$649 / 組合 NT$619 | openai / openai |
| 2 | NT$669 | 單買 NT$649 / 組合 NT$619 | openai / deterministic |
| 3 | — | 單買 NT$630 / 組合 NT$600 | openai / openai |

- standalone：offer_5ed15044-c265-4a52-aadd-330b4c106d78，有效期限 2026-09-12T05:17:37.251Z
- bundle：offer_1989d5a9-a9e3-459e-9755-736e3c574803，有效期限 2026-09-12T05:17:37.251Z

### seller_e — 固定價格

維持 NT$679，不跟價，第一輪報最終價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 | openai / openai |

- standalone：offer_039482e1-2bc0-4a42-98d1-ed3e0fe7eed3，有效期限 2026-09-12T05:17:32.325Z

## 模型與 fallback

HTTP 呼叫：30；API 已回報 token：38045；保守預留 token：221662。採用模型決策 28 次，fallback 2 次。

- seller_d 第 2 輪 seller：模型報價超出賣家允許範圍，已由固定策略接手
- seller_c 第 2 輪 seller：模型報價超出賣家允許範圍，已由固定策略接手

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
- [x] Buyer 與 Seller 均實際成功使用真實模型
- [x] 執行未超過固定模型呼叫與 token 預留上限
- [x] SQLite Offer 不可變且完整持久化
- [x] 關閉／重開 SQLite 後重播同一結果，不再付模型費用
- [x] 其他買家無法讀取執行結果

本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。
