# Orchestrator 前段探索與評分 v0.2

2026-09-12 設定權重擴充：傳入 ranking_weights 且沒有明示 priorities 時，依 [BUYER_SETUP.md](BUYER_SETUP.md) 四項權重評分；沒有目標價時仍依最高預算計算價格分數。不帶權重的舊 query 保留本文件原政策。全部硬限制仍優先，贊助不計分。

狀態：已實作 TypeScript service、固定測資、SQLite 快照與執行紀錄。政策版本 `discovery-score-v0.4`。不需要 LLM；輸入為已解析條件，自然語言解析仍交给 Formatter。

v0.3 將 target_total_twd 改為選填；未提供時價格分數與權重為 0，price_difference_twd=null，其他有效項目按原比例重新分配。可只傳 `{ category: 'mouse' }`。明確提供的 max_total_twd 仍是獨立硬限制，不自動當成目標價。若提供價格，須為正整數；null、0、負數及字串均拒絕。歷史執行紀錄保留原政策版本，不重新計算。

## 呼叫與資料

```ts
const service = createDiscoveryService({ db, userId, registeredSellerIds });
const result = service.discover_candidates({
  query: { category: 'mouse', target_total_twd: 800 },
  snapshot_id: 'discovery_demo_v02',
  now: '2026-09-12T10:00:00+08:00'
});
```

介面定義：`src/orchestrator/discovery.ts`。query 可另帶 `max_total_twd`、`required_features`、`required_attributes`、`preferred_attributes`、`delivery_days_max`。屬性支援 color、size_class、shape 的相等比較。此探索 DTO 與現行 NormalizedIntent 分開，因為「800 左右」是 target，不能誤寫為使用者同意的最高預算。尚未提供 Request 自動轉接或尺寸 range 規則。

資料為 15 個合成 Seller、120 筆 listing（90 筆滑鼠、30 筆滑鼠墊），含價格、運費、商品／賣場評分與筆數、庫存、交期、規格、參考來源 ID、Campaign。以既有公開商品型號與參考價為基礎擴充，並非 120 筆新爬取的真實刊登；賣場、價格、評分及商務資訊全部標記 synthetic。source_ids 可對應既有 marketplace_sources 的 URL 與日期。amazon_demo/shopee_demo 是模擬平台分類；全部模擬交易使用 TWD，不代表外幣換算結果。

## 篩選與取五筆

1. 類別必須是滑鼠；排除停用賣場、已知缺貨。
2. 核對硬功能、硬屬性、最大交期及明確最高總價。失敗者只可作需確認的替代商品。
3. 目標價沒有 ±20% 排除門檻；所有可售滑鼠均參與價格評分。
4. 先排完全符合硬條件者，再排替代方案。兩組各依總分高至低排列，同分以 listing_id 字典序。
5. 每個 Seller 保留最前的一筆，取五個不同 Seller；不足合格商品時以替代方案補滿五張卡。
6. 替代方案標為 alternative_requires_confirmation，列出 violations，negotiation_ready=false，不能當合格 Offer。
7. 如果全資料庫連五家有可售滑鼠的 Seller 都沒有，如實回 shortage_reason，不補造或重複賣家。預設測資保證一般 800 元需求可產生五筆。

探索可在 Seller handler 尚未完成時開發；只有已註冊 handler、無硬條件違反且含稅運總價已知者 negotiation_ready=true。registeredSellerIds 必須由 Backend 實際 handler registry 注入，不能從資料庫有 Seller 就推定可議價。

## 評分公式

每個分項為 0～100 分，總分為分項乘權重之和。

| 分項 | 權重 | 公式 |
| --- | --- | --- |
| 價格接近度 | 45% | max(0, 100 × (1 − abs(含稅運總價 − 目標价) / 目標價)) |
| 明確軟偏好 | 25% | 命中項數 / 指定項數 × 100 |
| 商品評分 | 15% | 平滑後星等 × 20 |
| 賣場評分 | 10% | 平滑後星等 × 20 |
| 到貨速度 | 5% | clamp(100 × (8 − 到貨天數) / 7, 0, 100) |

沒有指定軟偏好時，其他權重按原比例除以 0.75：價格 60%、商品評分 20%、賣場約 13.333%、速度約 6.667%。沒有編造每個人都偏好的顏色或外型。

| 可用條件 | 價格 | 偏好 | 商品評分 | 賣場評分 | 交期 |
| --- | --- | --- | --- | --- | --- |
| 有目標價、有偏好 | 45% | 25% | 15% | 10% | 5% |
| 有目標價、無偏好 | 60% | 0% | 20% | 13.333% | 6.667% |
| 無目標價、有偏好 | 0% | 45.455% | 27.273% | 18.182% | 9.091% |
| 無目標價、無偏好 | 0% | 0% | 50% | 33.333% | 16.667% |

權重由有效基礎權重除以其總和計算，表格為四捨五入顯示。沒有目標價時仍顯示商品價格，不推論使用者已同意支出或自動套用歷史預算。

評分平滑採固定先驗 4 星、20 筆：`(星等 × 筆數 + 4 × 20) / (筆數 + 20)`。缺失評分使用先驗，輸出原始 rating 仍為 null，不宣稱實際有 4 星。少量五星不會自動打敗大量 4.8 星。本版賣家可信度只用賣場評分；buyer-seller 真實交易資料完成後才升版加入個人信任。

價格分數目標 800 元時：800→100、720→90、960→80。總價是商品含稅價加確定運費；未知運費或未確認含稅則 total_price_twd=null、價格分數=0、pending_checks 註明，不能自動派發。明確最高預算不符者為替代方案；報價可能經議價降低，但目前不宣稱已符合預算。

排序用未四捨五入的總分；輸出總分保留四位小數。固定先驗、ID 平手規則、指定時間與快照確保同輸入可重現。這是探索排名，不是談完後 Evaluator 的最終推薦。

## 廣告與稽核

v0.4 加入 product_preferences 完整運算：required 的 in / not_in / range 不符或資料缺失列為硬限制違反；preferred 命中數加入偏好分子、條件數加入分母。每條偏好等權，多選 values 是同一條偏好，不重複加分。上面的基本權重表適用未傳 priorities：price_first / delivery_first / trust_first 各將價格／交期／賣家市場評分的有效基礎權重乘 2，最後全部正規化；沒有目標價時價格權重仍為 0。歷史 discovery_run 維持原 policy_version，不重新計分。

排名完成後才從已入選且合格的 Seller 中選 Campaign，須啟用、類別相符、bid>0、starts_at<=now<ends_at。bid 高優先，同價按 campaign_id。Campaign 不參與任何分項、補位或 Seller 去重。

SQLite migration `002_discovery` 增加 discovery_catalogs 與 discovery_runs；隊友的 `002_five_seller_negotiation` 是另一個獨立 migration，版本以完整檔名辨識，不是只取數字。前者存不可變的完整 JSON Catalog 快照，後者存 user_id、政策版本、query、完整結果與時間；可用 SQLite json_each 查詢 snapshot 內 listings，不與 canonical 的九筆 products 混用。這是第一版獨立資料集，可在後續升版拆成正規化 listing 表。

`rankCandidates` 是無副作用的純函式；`discover_candidates` 讀取指定 SQLite 快照並新增稽核紀錄。run_id 每次不同，但排名相同。尚未串 UI、付款或議價。

## 開發操作

```sh
npm run db:init             # 尚未建立本地 DB 時才需要
npm run db:seed:discovery   # 加入 002 與測資，保留原有需求及 Offer
npm run demo:discovery      # 800 元範例，會寫入一筆 discovery_run
npm test
```

seed 可重複執行；相同 snapshot_id 但資料不同會拒絕，更新測資須使用新 ID。db:rebuild 是重建舊核心 seed 的破壞性指令，執行後需再 db:seed:discovery；本功能不自動 rebuild。

驗收：120 listings、五家去重、硬條件替代標示、缺貨排除、運費／未知值、評分筆數平滑、廣告與順序不影響自然結果、快照與紀錄不可變、seed 重跑保留原資料。
