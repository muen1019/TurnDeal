# Orchestrator → 協商 → Evaluator 完整測試

執行時間：2026-09-12T05:19:53.213Z；模式：live；模型：gpt-4.1-mini-2025-04-14；耗時：18.2 秒。

**FAIL**：19/20 項檢查通過。5 家 Seller，7 個最終 Offer，結果狀態 awaiting_user。

範圍：SQLite 已解析需求 → 遠端 handoff.prepare／Discovery → 五家 Seller → Buyer／Seller 模型協商 → Backend 驗證 → SQLite 持久化與重開重播。另包含獨立 Evaluator 排序。不包含 HTTP／UI 操作或交易兌換。

## 五套 solution

| 賣家／偏好 | 單買 | 組合 | 配送 | 已執行輪次 | 停止原因 |
| --- | ---: | ---: | --- | ---: | --- |
| seller_a・願意讓價 | NT$569 | — | 5 天 | 3 | seller_final |
| seller_d・組合更便宜 | NT$630 | NT$600 | 2 天 | 3 | seller_final |
| seller_c・免費送周邊 | NT$639 | NT$639 | 3 天 | 3 | seller_final |
| seller_e・固定價格 | NT$679 | — | 4 天 | 1 | seller_final |
| seller_b・快速配送 | NT$719 | — | 1 天 | 4 | seller_final |

展示設定：C 同價免費贈品；D 組合包含滑鼠墊且便宜 NT$30。單買與組合各有獨立 Offer ID，因此五張卡片可能有七個 Offer；本報告依 Evaluator 排名呈現五個賣家方案，完整 Offer 排名如下。金額都是模擬商家含稅運 TWD。

## Evaluator 排名

來源：openai；模型：gpt-4.1-mini-2025-04-14；耗時 6.26 秒；呼叫 1 次；API tokens 2669；fallback：無。

| 排名 | Seller | 選項 | 含稅運 | 到貨 | 原因 |
| --- | --- | --- | ---: | --- | --- |
| 1 | seller_a | standalone | NT$569 | 5 天 | 570元最高性價比，價格最低，交貨5天符合需求 |
| 2 | seller_d | bundle | NT$600 | 2 天 | 600元含滑鼠墊套裝，價格次低，交貨最快2天 |
| 3 | seller_d | standalone | NT$630 | 2 天 | 630元次低價單品，交貨2天速度快 |
| 4 | seller_c | standalone | NT$639 | 3 天 | 639元，價格第四，交貨3天 |
| 5 | seller_c | bundle | NT$639 | 3 天 | 639元滑鼠加墊套裝，價格第四，交3天貨 |
| 6 | seller_e | standalone | NT$679 | 4 天 | 679元價格第六，交貨4天 |
| 7 | seller_b | standalone | NT$719 | 1 天 | 719元最高價，交貨最快1天但價格不符喜好 |

## 每輪協商

### seller_a — 願意讓價

逐輪降價，優先匹配競爭價格，配送較慢。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$590 | openai / openai |
| 2 | NT$679 | 單買 NT$580 | openai / openai |
| 3 | NT$679 | 單買 NT$569 | openai / openai |

- standalone：offer_8c91943c-bd8d-450c-a43b-bc783f9dc091，有效期限 2026-09-12T05:30:01.868Z

### seller_d — 組合更便宜

滑鼠加滑鼠墊比同輪單買便宜 NT$30，配件可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$649 / 組合 NT$619 | openai / openai |
| 2 | NT$669 | 單買 NT$639 / 組合 NT$609 | openai / openai |
| 3 | NT$659 | 單買 NT$630 / 組合 NT$600 | openai / openai |

- standalone：offer_4e83e1c0-fce5-4a6c-843d-2c92b3e943f5，有效期限 2026-09-12T05:30:01.643Z
- bundle：offer_433f930e-0cd5-4f60-a4fb-87969a81baab，有效期限 2026-09-12T05:30:01.643Z

### seller_c — 免費送周邊

提供單買與同價贈送滑鼠墊，贈品可拒絕。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$669 / 組合 NT$669 | openai / openai |
| 2 | NT$590 | 單買 NT$659 / 組合 NT$659 | openai / openai |
| 3 | NT$580 | 單買 NT$639 / 組合 NT$639 | openai / openai |

- standalone：offer_b1ecfdd6-d9a4-4713-8772-15ed2610afe1，有效期限 2026-09-12T05:30:01.773Z
- bundle：offer_4a7bc2f0-efe3-4796-b251-004e51f978d0，有效期限 2026-09-12T05:30:01.773Z

### seller_e — 固定價格

維持 NT$679，不跟價，第一輪報最終價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$679 | openai / openai |

- standalone：offer_11063256-5821-4d6b-b4ab-b96cdf79b0e0，有效期限 2026-09-12T05:29:55.098Z

### seller_b — 快速配送

以一天到貨為優勢，保留較高售價。

| 輪次 | Buyer 還價目標 | Seller 回覆 | 執行來源 Buyer／Seller |
| --- | ---: | --- | --- |
| 1 | — | 單買 NT$749 | openai / openai |
| 2 | NT$669 | 單買 NT$740 | openai / openai |
| 3 | NT$659 | 單買 NT$730 | openai / openai |
| 4 | NT$630 | 單買 NT$719 | openai / openai |

- standalone：offer_352a61cb-80e1-497c-ba0f-ff76e8f2c819，有效期限 2026-09-12T05:30:03.965Z

## 模型與 fallback

HTTP 呼叫：28；API 已回報 token：34856；保守預留 token：204475。採用模型決策 28 次，fallback 0 次。

本次沒有 fallback。

## 自動驗證

- [x] 遠端 handoff.prepare 實際選出五家，計畫與 Discovery 已保存並可重播
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
- [x] Evaluator 排完全部七個有效 ID，產生五個賣家方案並符合價格優先
- [x] Evaluator 實際採用真實模型排序
- [x] Evaluator 發布快照不可修改，Sponsored 未改變推薦
- [x] 關閉／重開 SQLite 後重播同一結果，不再付模型費用
- [x] 其他買家無法讀取執行結果
- [x] Evaluator 關閉／重開 SQLite 後保持相同排名與原因
- [ ] 說明文字人工驗收：模型將 NT$569 寫成 570 元、將 2 天稱為最快（實際有 1 天）。排名數字正確，文字驗收未通過；後續版本加入說明驗證。

本次模型輸出是實測快照，後續執行的價格與提前停止輪次可能不同。原始私有 prompt 與底價只留在本機 SQLite，沒有放入此報告。
