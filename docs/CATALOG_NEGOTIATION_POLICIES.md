# 完整 Catalog 談判政策

2026-09-12 在 hackathon 期間完成。前一版本已合併並推送 main（a69ce8f）；本次接續補資料庫與完整 runtime 的候選來源。

## 實際覆蓋

| 資料集 | 賣家 Persona | SKU 政策 | 主商品 / 配件 |
| --- | ---: | ---: | --- |
| Canonical | 5 | 9 | 8 支滑鼠、1 張滑鼠墊 |
| Discovery | 15 | 120 | 90 支滑鼠、30 張滑鼠墊 |
| 合計 | 20 | 129 | 98 支滑鼠、31 張滑鼠墊 |

Discovery 全部 90 筆滑鼠可參與符合需求的議價；30 張滑鼠墊只能作為授權配件。Canonical 新補的三個顏色 SKU 雖有政策，仍不自動加入原本限指定 SKU 的 Persona 活動，避免白色商品繼承黑色清庫折扣。原本五個主商品仍可議價。

Discovery 01/06/11 為清庫型、02/07/12 為履約型、03/08/13 為組合型、04/09/14 為關係型、05/10/15 為服務型。這些設定在資料檔中已具體列出，與入選名次無關。正常流程依硬條件與公開分數自然取前五家，不強制五種 Persona 各一家。

## 各參數的儲存位置與邊界

| 因素 | 欄位／來源 | 執行限制 |
| --- | --- | --- |
| Persona、經濟目標、停止輪次 | seller_persona_policies | prompt 只可在政策範圍內表達與選擇 |
| 個別 SKU 底價 | seller_inventory.floor_price_twd | 任何正式方案不得低於底價，價格包含稅運 |
| 成本、最低貢獻率 | seller_sku_policies 的 unit_cost_twd / shipping_cost_twd / min_margin_bps | 本商品、物流、贈品與實際權益一起計算 |
| 降價與最多讓步 | opening_discount_cap_twd / max_discount_per_step_twd / max_total_discount_twd / max_concession_count | 依已提交歷史限制每輪與整場幅度，最多五輪 |
| 贈品白名單／成本 | addon_costs / gift_cost_budget_twd | 僅限同 Seller 的滑鼠墊；庫存、交期、條款與成本都須符合 |
| 取消贈品換折扣 | gift_exchange_discount_cap_twd | 需引用自己的既有組合，累計折現受限且不能突破總底線 |
| 整場讓利預算 | total_concession_budget_twd | 即時折扣、配件成本、權益成本合計受限 |
| 未來券、會員權益 | voucher_budget_twd / benefit_costs 與已登錄 benefit_schedule | 券額按全額占用預算，不抵本次總價；會員與最低消費條件公開 |
| 庫存壓力 | inventory_pressure | high / normal / low；清庫型只對 high 的 SKU 開放價格讓步 |
| 可承諾物流 | seller_inventory.delivery_days + seller_benefit_catalog evidence | 不因 Persona 虛構更快交期；共用到貨保證採該賣場最保守天數 |
| 保固、退貨、客服、換貨 | 已登錄 benefit / SKU 範圍 / 模擬 evidence | 選項須可驗證、仍有額度，不能由模型新增 |

全部商務成本、底價與服務證據均為 synthetic Demo 設定，不代表真實平台商家的成本或承諾。本版使用含稅現金貢獻率，不宣稱正式會計毛利率。Discovery 底價以原含稅運售價的 80% 向上取整；示範商品成本為原商品價的 45% 向下取整，物流成本沿用原運費，最低貢獻率 15%。這些生成後的數值逐筆保存於 fixture，runtime 不會根據排名重新計算或分配。

每個 SKU 的開價讀取其庫存 list_price_twd。Persona 的 base_price_twd 是舊單 SKU 格式相容欄位／示範參考值；新 importer 不使用它覆寫六款商品的價格。原 Discovery 商品缺少的尺寸數字以 null 表示，不能由型號猜測。

## 資料檔與初始化

- contracts/fixtures/catalog-negotiation-policies.json：15 家／120 筆完整政策，以及 canonical 4 筆缺漏補項。
- contracts/fixtures/sales-profiles.json：原五家 Persona 與五個指定主 SKU 的政策。
- db/migrations/010_catalog_policy_backfill.sql：listing 綁定與版本化 seed 紀錄。
- seller_listing_bindings 保存原 snapshot_id、listing_id、source_product_id 與新的 sku_listing_NNN。不同賣家或顏色不能共用 model_N 當實體庫存 SKU。
- 原始 discovery_catalogs 快照不修改；runtime 建立新的 configured 快照，傳遞公開 Persona 與可驗證 public_services。私有底價、成本、預算不進入探索分數。

```sh
npm run db:seed:policies
# 可指定既有資料庫；先備份，再移植 schema 與補資料，不重建歷史
node scripts/populate-catalog-policies.mjs data/negotiation.sqlite
npm run test:seller-policies
npm run test:e2e:catalog
npm run test:e2e:catalog -- --after-sales
npm run test:e2e:catalog -- --live --after-sales
```

同一 seed 版本重跑不改價格、不补庫存、不重設權益額度。相同版本內容改動會拒絕；新的賣家 ID 若碰到既有資料也會拒絕並 rollback，不覆寫既有策略。既有商家的政策更新應另寫明確更新 migration；不能只改版本號來覆蓋現場設定。重新產生初版示範 fixture 的維護指令為 node scripts/generate-catalog-policies.mjs，執行後仍須 review 差異，已套用同版本的 DB 不會自動接受內容改動。

尚未實作任意物流地區／截單時間引擎、新舊客分層點數規則、跨請求贈品／券額度預留。這些限制沿用既有設計，不因補齊資料而宣稱已支援。HTTP Result 與 ACP 模擬購買路徑由已合入的遠端程式提供，本次保留並執行回歸測試。
