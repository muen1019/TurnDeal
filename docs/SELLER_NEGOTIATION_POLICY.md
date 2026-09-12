# Seller 私有議價格式 v0.1

Tech Lead 定義格式，Negotiation owner 填值並實作 Seller handler。本次只新增契約、待填模板及驗證器，不啟用任何新賣家策略、不寫入 SQLite、不改舊版三家 Seller。現行仍是兩輪；SYSTEM_DESIGN 的十輪另行升版。

## 交接檔案

- `contracts/seller-negotiation-policy.v0.1.schema.json`：JSON Schema，所有欄位必填，明確允許的 null 例外。
- `contracts/fixtures/seller-negotiation-policies.template.json`：15 家 Seller、90 筆主商品的待填骨架；30 筆滑鼠墊透過 addon 引用。
- `scripts/validate-seller-policies.mjs`：格式與跨欄位／Catalog 引用驗證。Schema 本身不涵蓋全部語意，必須一起驗證。

模板所有 seller 為 draft，settings 與 terms 為 null。請複製為自己的模擬策略檔，再填入數值。缺設定不可預設為零元、不可自動套用舊 Seller 的策略。ready 代表所列商品皆完成設定，仍需啟用的 Seller、庫存、需求檢查及已註冊 handler 才能議價。未列出的商品不可議價。

## 欄位定義

| 欄位 | 用途 |
| --- | --- |
| schema_version / snapshot_id | 契約版本與綁定的 Catalog 快照，換價目表必須重新驗證 |
| data_origin | 固定 synthetic；公開 repo 只放模擬底價，真實商業機密不可提交 |
| seller_id / status | 所屬賣家；draft 或 ready |
| settings.strategy | price_first、delivery_first、bundle_first、balanced；風格標籤不能凌駕數值上限 |
| settings.max_rounds | 固定 2；同一輪重試不得視為新一輪 |
| settings.timeout_ms | 每次呼叫 1–3000 ms；Backend 另維持整體 8 秒 deadline |
| settings.quote_ttl_seconds | 報價有效秒數；Backend 以實際發行時間計算到期時間 |
| settings.buyer_below_floor | counter_at_floor 回底價反提案；refuse 拒絕，不得洩漏底價欄位 |
| settings.after_last_round | 固定 stop，不繼續讓價；既有未過期報價仍依原期限處理 |
| listings[].listing_id | 主商品刊登 ID，不用跨賣家重複的 product_id |
| terms.floor_item_price_twd | 含稅、不含運費的主商品最低售價；不能高於 Catalog 售價 |
| terms.round_discount_twd | 長度 2，每輪相對 Catalog 售價的累計折扣，不是逐輪再相減 |
| terms.shipping.waive_from_round | 第幾輪可免基本運費；null 表示不提供 |
| terms.shipping.min_item_subtotal_twd | 折扣後主商品金額滿此值才可免運；0 代表無門檻 |
| terms.delivery.fastest_days | 可承諾的最快到貨天數；不得慢於 Catalog 原交期 |
| terms.delivery.expedite_from_round | 第幾輪可應買家交期需求加速；null 不提供，fastest_days 必須等於原交期 |
| terms.delivery.expedite_fee_twd | 加速額外含稅費用；未提供加速時為 0；不能被基本免運抵消 |
| terms.addon | null 無配件；否則限同賣家的單一滑鼠墊，每次 1 件 |
| addon.listing_id / mode | 配件刊登；free_gift 免費可拒絕，paid_optional 需買家明確授權 |
| addon.buyer_price_twd | 含稅配件加價，免費為 0，付費須大於 0；已包含配件配送，不重複加 Catalog 運費 |
| addon.from_round / min_item_subtotal_twd | 開放輪次及折扣後主商品金額門檻 |

所有金額為整數 TWD。拆項可不含運，但正式 Offer 的 total 必須含稅含運。

## 填寫範例（教學數字，不是已啟用策略）

以下可作為 discovery_seller_01 / listing_002 的 settings 與 terms；其他主商品仍需各自設定。

```json
{
  "settings": {
    "strategy": "balanced",
    "max_rounds": 2,
    "timeout_ms": 3000,
    "quote_ttl_seconds": 300,
    "buyer_below_floor": "counter_at_floor",
    "after_last_round": "stop"
  },
  "terms": {
    "floor_item_price_twd": 649,
    "round_discount_twd": [20, 60],
    "shipping": { "waive_from_round": 2, "min_item_subtotal_twd": 600 },
    "delivery": { "fastest_days": 1, "expedite_from_round": null, "expedite_fee_twd": 0 },
    "addon": {
      "listing_id": "listing_007",
      "mode": "free_gift",
      "buyer_price_twd": 0,
      "from_round": 2,
      "min_item_subtotal_twd": 600
    }
  }
}
```

此刊登原價 709、運費 60：第一輪主商品 689、總價 749；第二輪主商品 649、可免運，總價 649，可另提供免費滑鼠墊方案。不可把第二輪算成 709−20−60。贈品資格獨立於免運；兩者可同時使用。底價是主商品底線，填寫者須自行把免運／贈品成本納入商業可行性。

## Handler 必須遵守（尚待 Negotiation owner 實作）

1. 一般報價主商品 = Catalog 售價 − 該輪累計折扣；不得突破 floor。買家提出低於底價的主商品價格時，依 buyer_below_floor 拒絕或以底價反提案；僅有買家總價時不可直接當主商品金額，也不可取得私有預算。
2. 總價 = 主商品 + 基本運費（符合免運則 0）+ 已授權配件價格 + 實際採用的加速費。未要求加速時維持原交期、不收加速費。
3. 無庫存、Seller 停用、缺政策、錯誤商品或不支援的條件須拒絕；不能為湊五家而偽造報價。加購不提供時仍可回 standalone；免費贈品可拒絕，付費加購沒有授權不得加入。
4. 配件與主商品均需重查庫存；加速與 bundle 的交期必須可同時兌現，否則不提供該方案。接受與兌換時 Backend 再次驗證。
5. timeout 由編排層中止，不能偽造成功；同 RFQ／輪次／政策快照的重试應可重播。Backend 配置正式 immutable offer_id，Seller 的 quote reference 不能取代它。
6. 只回既有契約的 Seller 草稿與公開條件；floor、完整政策、其他 Seller 資訊不能送到 Buyer、Orchestrator 搜尋結果、Evaluator 或 UI。Sponsored 不影響讓價規則或推薦排名。

## 驗證與接線範圍

```bash
npm run test:seller-policies
node scripts/validate-seller-policies.mjs contracts/fixtures/your-policies.json
npm test
```

Negotiation owner 交付：已填的 synthetic 政策、僅限自身 seller_id 的讀取與 handler、可重播兩輪測試、拒絕／timeout／贈品授權案例。Tech Lead 再接私有儲存與 handler registry；目前不提供政策讀取給 Discovery，亦沒有自動載入模板的 runtime。這個新增契約不取代既有 RFQ／Offer schema。
