# Seller Persona 與偏好匹配實作

本文件記錄 2026-09-12 本次實作，對應 [目標設計](SELLER_POLICY_DESIGN.md)。

## 已完成的資料流

1. Demo 建檔時以 seller_id 綁定 Persona，寫入 seller_persona_policies；Orchestrator 的賣家資訊投影現在包含 persona，未配置者為 null。沒有按入選名次分配 Persona。
2. 每個指定 SKU 的私有政策寫入新表 seller_sku_policies，複合外鍵綁定 seller_inventory。不同商品可以有不同成本與讓步上限；模型無權修改。
3. Backend 結合固定開價、前次報價、已提交歷史與商品政策，計算合法價格範圍；Seller 模型在範圍內選價、選擇已開放權益。
4. Backend 再次驗證正式草稿，尤其是單買及組合各自的成本；贈品／折現／權益不能跨方案拼接。
5. Formatter 支援 after_sales_first，Orchestrator 依已包含的公開售後条件匹配，Evaluator 依實際驗證的 Offer 權益排序。兩者都不以 Persona 名稱加分。

## 策略、底線與狀態

Persona 仍包含商業目標、指定 SKU、價格保護、贈品／權益開放時機、最大停止輪次與 TTL。decision_mode=bounded 啟用本次的新議價範圍；缺省 scheduled 保持舊版行為，舊資料不因 migration 自动換成新價格。

SKU 政策記錄 policy_version、首次／後續單次折扣上限、累計折扣上限、最多讓步次數、商品與基本物流成本、最低利潤率、贈品成本白名單與上限、贈品交換上限、券面額上限、權益成本與合計讓利預算，以及庫存壓力。

本版 synthetic 成本全部採一致的含稅現金口徑，最低利潤率是政策貢獻率，不是正式會計毛利率。各種成本資料只用於模擬，不宣稱真實商家的進貨價。未來券按全額面額或更高的已登錄成本保守占用預算，不能減少本次價格。

每次讓步依已提交的降價、加贈或新增權益計算，同輪多項改善只計一次；相同報價及重播不再計次。到達上限時 final。首次沒有折扣或權益的普通詢價不計為讓步。商品政策版本及成本跟隨協商 Catalog 快照保存，已發布 Offer 不改寫。

普通價格最低值同時受商品底價、累計折扣、單次折扣與經濟下限約束。取消贈品的額外折扣從普通價格下限另計，按整場協商累計；不得繞過最終底價、成本與總預算。組合價格與單買價格的差額仍須重新判斷加購授權。

Seller 的模型輸入包含目標、私有政策、本輪狀態、合法範圍及權益 ID。prompt 版本 negotiation-3。round_discounts_twd 在 bounded 模式只用於 deterministic fallback，不再強制真實模型照該排程出價。價格保護型仍可只有一個合法價格。

為確保模型任選當輪權益也不超支，價格範圍保守預留所有當輪可用權益的成本；不是尋找所有權益子集合的最低價。每筆輸出仍按實際選取權益單獨驗證。無合法方案時拒絕，不以零成本或補造資料放行。

## 公開條件與售後匹配

public_services 是由 Backend 自已登錄權益及履約證據產生的白名單投影，包含權益 ID、種類、期限、公開條件、證據 ID、模擬標記及 included／negotiable。成本、底價、開放輪次及整份策略不公開。

從第一輪即提供、無會員及最低消費門檻的權益可標為 included，Seller 必須帶入這些仍可履約的權益。後續才可談的條件標為 negotiable，不用來加探索分數。沒有資料的維度以零分處理並標示未知，不因為賣家名稱或 Persona 推定能力。

售後條件分數為 0–100：

| 維度 | 分數 |
| --- | --- |
| 已登錄保固總天數 | 50 × min(天數／730, 1) |
| 已登錄退貨期 | 25 × min(天數／30, 1) |
| 已登錄瑕疵換貨期 | 15 × min(天數／30, 1) |
| 已登錄客服回覆天數 | 10／天數；缺資料為 0，不等同問題解決時間 |

每種維度只使用最佳的一項，不因重複登錄相同權益加分。不計入未來券、晚到補償或贈品的宣稱價值。範圍與除外條件仍須展示；此分數是 Demo 明定比較規則，不表示任何保固範圍都相同。

Discovery 政策升至 discovery-score-v0.5。after_sales_first 加入 0.60 的基礎售後權重，再與其他有效權重正規化。這是綜合探索分數，並非保證售後最佳者在任何混合偏好下都第一。

明確 price_first 使用 `100000 / (1000 + 含稅運總價)` 計算價格分數，越便宜分數越高；有無 target 都適用。不帶 price_first 但提供 target 時仍使用原本目標價接近度；兩者均未提供才將價格權重設零。不以私有底價或可砍價空間排名。

Evaluator 的 after_sales_first 使用同一售後分數，依使用者優先順序逐項比較。它只讀取實際 Offer 上 Backend 驗證的權益；沒有從 terms_id 猜保固，也不把探索時可談的選項視為已談成。Structured Outputs 的輸出形狀維持原樣，偏好 enum 增加 after_sales_first。

## 執行與驗證

Node 24 執行 root 測試及 Demo；前後端仍使用 Node 20.19.5。

```sh
npm test
npm run demo:negotiate -- --personas --offline --memory
node scripts/e2e-negotiation.mjs --offline --evaluate
node scripts/e2e-negotiation.mjs --offline --evaluate --after-sales
node scripts/e2e-negotiation.mjs --live --evaluate
node scripts/e2e-negotiation.mjs --live --evaluate --after-sales
```

E2E 現在從明確的中文需求經 deterministic Formatter 開始，進入 SQLite、既有 handoff.prepare／Discovery、五個 Buyer/Seller、Backend、Evaluator 與快照重播。live 使用真實模型議價及 Evaluator；Formatter 仍是規則解析。不同偏好使用不同 request，不改寫既有已發布快照。

同一 Demo 資料集預先含五種 Persona，透過合格條件自然入選。一般候選名單可含重複 Persona；不強制每種各一家，不以不合格賣家補位。

## 邊界與後續設計

最初本模組未包含前端／HTTP；目前已合入遠端完整 runtime 與 ACP 模擬購買流程。本次再補入 15 家／120 筆 Discovery 政策，詳見 [完整 Catalog 談判政策](CATALOG_NEGOTIATION_POLICIES.md)。現有能力仍是模擬履約；報價檢查可用額度不等同已預留或已扣庫存。

22 項目標因素中，複雜地區／截單物流、多層會員資格、新舊客細分、任意活動範圍與多券疊加，以及交易時的跨請求額度預留，仍沿用既有有限能力或保留為後續擴充，不宣稱已實作通用規則引擎。明確「至少三年保固」等售後硬限制尚無正式欄位，Formatter 必須要求澄清，不可降格成軟偏好。

公開權益的可靠性來自 Backend 建立的權益資料與證據投影；服務分數函式信任其 Catalog 輸入，不能直接把任意外部賣家 JSON 當作已驗證資料。歷史 Discovery 快照仍不可變，議價前及最終推薦前繼續重新檢查履約能力。
