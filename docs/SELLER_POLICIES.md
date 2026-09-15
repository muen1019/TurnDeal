# Seller policies 與 Personas

TurnDeal 的 Persona 是預先綁定 Seller 的可執行商務策略，不是依搜尋名次分配的說話風格。Backend 保存可驗證的 SKU 底線、能力、權益與狀態；模型只能在 Backend 計算的合法範圍內選擇。

## 資料層

| 層級 | 內容 |
| --- | --- |
| Seller Persona | 經濟目標、決策模式、停止輪次、可談籌碼 |
| SKU policy | 底價、成本、margin、單次／累計折扣、讓步次數與 gift exchange |
| Benefit catalog | 保固、退貨、換貨、客服、物流補償、未來券及模擬履約證據 |
| Negotiation state | 已提交價格、讓步、權益、剩餘額度與不可變輪次歷史 |

主要 fixture：

- `contracts/fixtures/sales-profiles.json`：canonical A–E。
- `contracts/fixtures/catalog-negotiation-policies.json`：15 家 Discovery Seller、120 筆 listing 及 canonical 補項。
- `seller_listing_bindings`：明確綁定 snapshot／listing／source product／SKU。

歷史的 `seller-negotiation-policies.template.json` 是 inactive draft，不是 runtime 設定。

## 覆蓋範圍

| 資料集 | Sellers | SKU policies | 內容 |
| --- | ---: | ---: | --- |
| Canonical | 5 | 9 | 8 支滑鼠、1 張滑鼠墊 |
| Discovery | 15 | 120 | 90 支滑鼠、30 張滑鼠墊 |
| 合計 | 20 | 129 | 98 支滑鼠、31 張滑鼠墊 |

滑鼠墊只能作為同 Seller、相關且經授權的配件。所有價格、成本、評分、權益與證據都是 synthetic demo data。

## Canonical Personas

| Seller | 策略 | 可展示的 trade-off |
| --- | --- | --- |
| A | Price optimizer | 最低價、較慢到貨 |
| B | Speed seller | 價格較高、最快配送 |
| C | Bundle curator | 免費或明確差價的相關滑鼠墊、可詢問取消贈品換折扣 |
| D | Balanced／loyalty | 價格與交期平衡，canonical fixture 第三輪完成 |
| E | Margin guardian | firm price，canonical fixture 第一輪完成 |

真實模型可更早停止或拒絕，但不能突破 Backend policy。Deterministic fixture 必須維持上述可重現差異。

## 合法方案

每輪先由 Backend 根據開價、前次提交歷史、底價、成本、margin、讓步次數、配件／權益預算及庫存計算可選範圍。Seller 模型選擇價格、bundle 與已開放 benefit IDs 後，Backend 再驗證完整草稿。

- 價格是含稅運整數 TWD，不能把「免運」重複折抵。
- 普通價格同時受底價、單次／累計折扣、成本與總讓利預算限制。
- 取消贈品換折扣按整個 request 累計，不能繞過底價或成本。
- Bundle 與 standalone 各自驗證；組合價較高時仍需使用者明示付費配件授權。
- 未來券不折抵本次價格，會員／最低消費／期限等條件必須公開。
- 售後與物流只能選擇已登錄、scope 相符、有剩餘額度且有模擬 evidence 的項目。
- 無合法方案時拒絕；缺資料不能當成零成本或成功。

每次讓步依已提交的降價、加贈或新權益計算；同輪多項改善只計一次，相同報價與重播不重複計次。達到政策上限時 branch final。

## Buyer／Seller 對話

Buyer 可以提出 `lower_price`、`add_gift`、`exchange_gift`、`compare` 或 `request_benefit`。競爭參考只能使用上一輪 Backend 驗證的去識別化 comparable terms。

Seller 回覆 `accepted`、`countered` 或 `declined`；拒絕一次條件不等於拒絕整個 branch。結構化資料決定商務內容，message 不能創造額外折扣、贈品或服務。

## 公開投影與排名

`public_services` 只公開權益種類、期限、條件、模擬 evidence、included／negotiable 狀態，不公開成本、底價、額度或開放輪次。Discovery 與 Evaluator 都只使用 Backend 驗證後的公開／Offer 內容，不因 Persona 名稱加分。

`after_sales_first` 依已登錄保固、退貨、換貨與客服回覆條件比較；未來券、晚到補償與贈品不計入售後分數。沒有資料的維度為未知／零分，不能從 Seller 名稱推測。

## 初始化與驗證

```powershell
npm run db:seed:policies
npm run test:seller-policies
npm run demo:negotiate -- --personas --offline --memory
npm run test:e2e:catalog
npm run test:e2e:full
```

同一 seed version 重跑不得改價、補庫存或重設權益額度；內容改動須使用新版本及明確 migration。啟動不得按排名分配 Persona，也不得用 `base_price_twd` 覆寫 listing price。

尚未支援通用物流地區／截單引擎、多層會員、新舊客細分、多券疊加、跨 request 權益預留，以及任意售後 hard constraint。不要把有限 demo policy 宣稱為通用商務規則引擎。
