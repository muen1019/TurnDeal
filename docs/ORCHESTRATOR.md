# Orchestrator

Orchestrator 讀取已解析且屬於目前 buyer 的 Request，凍結 Discovery input，選擇合格 Seller，建立一個 branch per Seller，並把後續議價交給 negotiation manager。

## 資料接口

`src/orchestrator/data-tools.ts` 提供 Backend-only 的同步查詢：

| 函式 | 結果 |
| --- | --- |
| `get_request_context` | Request 文件、revision、status 與 NormalizedIntent |
| `get_request_preferences` | request-bound preference snapshot 與配件政策 |
| `list_catalog` | 公開商品、庫存、交期、條款與來源 ID |
| `list_sellers` | Seller 與 handler 註冊狀態 |
| `get_seller_trust` | 個人／市場評分摘要 |
| `list_active_campaigns` | 可顯示的 Campaign |
| `load_discovery_input` | 同一 SQLite read snapshot 的完整探索輸入 |

資源不存在與不屬於目前 buyer 都回 `not_found`。整合流程使用 `load_discovery_input`，避免分開查詢跨越不同資料庫時間點。

## 選擇與 handoff

1. 只保留啟用且有實際 handler 的 Seller。
2. 套用類別、庫存、交期與商品硬條件。
3. 依 [Discovery scoring](DISCOVERY_SCORING.md) 做自然排名，每家保留第一個候選。
4. 取前五個合格 Seller，或在不足時如實使用較少分支。
5. Campaign 只在自然入選集合中產生 Sponsored 標示。
6. 保存 request revision、Catalog snapshot、query、candidate bindings 與 RFQ。

`src/orchestrator/handoff.ts` 的 `prepare` 保存可重播 plan；`dispatch_first_round` 是舊前段測試接口。完整 runtime 不會重複使用它跑多輪，而是把已保存的 orchestration 交給 negotiation manager。

RFQ 只包含該 Seller 可見的白名單欄位。它不包含原始需求、最高預算、Campaign、trust、其他 Seller 資訊或私有 Backend plan。Seller 以 snapshot、seller ID 與 listing-to-SKU binding 查自己的商品，不能只用共用 model ID 推測庫存。

## 儲存與錯誤

同一 buyer、request、key 與相同輸入重播原 plan；同 key 不同輸入拒絕。Seller handler 例外、逾時或無效結果只終止該 branch，不影響其他 branch，也不回傳內部 exception。

Seller 回應仍是 untrusted draft。正式價格、庫存、交期、條款、配件與 Offer ID 由 Backend 在 negotiation path 驗證。

## 開發

```powershell
npm run test:orchestrator
npm run demo:orchestrator
npm run demo:handoff
```

Demo 使用 fixtures／記憶體 SQLite，不修改 `data/app.sqlite`。Discovery 與 runtime 政策資料見 [Seller policies](SELLER_POLICIES.md)。
