# Buyer／Seller negotiation

Negotiation 從已保存的 OrchestrationResult 開始，為每個合格 Seller 建立隔離的 Buyer／Seller branch。最多五輪；不足五家時只處理實際名單，Sponsored 不增加 branch。

## 執行

```powershell
npm run demo:negotiate -- --offline
npm run test:negotiation
npm run test:unit
npm run test:e2e
```

`--offline` 完全不呼叫 API；`--memory` 不寫入本機資料庫。Live mode 使用 server-side `API_KEY`，預設模型可由 `NEGOTIATION_MODEL` 覆寫：

```powershell
npm run demo:negotiate -- --live
npm run test:e2e:live
```

API 失敗、拒答、截斷、timeout 或非法決策使用 deterministic fallback。沒有自動模型 retry；每輪事件記錄實際 provider。

## Backend 入口

```js
const result = await negotiate({
  requestId,
  buyerId,
  orchestration,
  repository,
  apiKey: process.env.API_KEY ?? '',
  onEvent: event => updateRequestProgress(event),
});
```

`buyerId` 由已驗證身分取得。Intent、Catalog、庫存與 Seller policy 從該 Request 的 SQLite snapshot 讀取；呼叫端不能另傳資料覆寫它們。

`NegotiationOutput` 包含最新有效 Offers、eligible／needs-confirmation IDs、branch status 與 usage。它不排名、不採用、不購買；有合格方案時交給 Evaluator，否則回 needs confirmation 或 no match。

## 同步輪次

- Round 1 沒有競爭資訊。
- 同輪 branch 平行執行；Backend 驗證完所有準時回覆後，原子提交新的 shared context revision。
- 下一輪只能讀上一個 committed revision。
- Final、refused、timeout 或 failed branch 停止，其他 branch 繼續。
- Global deadline、call 或 token 上限可結束整場，並保留仍有效的候選。
- 遲到 response 不得寫入已提交 context。

Buyer 可以選擇降價、加贈、取消贈品換折扣、比較或要求已登錄權益。Seller 只看到自己的商品、policy、歷史與去識別化 competitive terms。詳細策略及成本界線見 [Seller policies](SELLER_POLICIES.md)。

## Offer 驗證

Seller model 只作 bounded decision；Backend 組裝及驗證正式草稿：

- SKU／Seller 歸屬、庫存、數量、價格、成本與底價；
- 到貨、terms、TTL 與已登錄 benefit evidence；
- bundle 關聯性、價格差與使用者授權；
- withdrawal、final 與 concession state。

非法新草稿不能取代舊有效 Offer。新 standalone baseline 會使舊 bundle 失效，Seller 必須在同輪重提。每家凍結時至多一個 standalone 和一個 bundle。

## 私密資料與事件

Competitive context 不得包含 Seller ID、Offer ID、逐字稿、floor、policy、Campaign 或 trust data。`onEvent` 只投影公開狀態與正式 Offer；私有 prompt／response 留在本地 audit，不能成為 HTTP response 或公開報告。

## 持久化

`negotiation_runs` 保存 request-bound input、Catalog snapshot、limits 與 final result；`negotiation_commits` 保存每輪 context、RFQ、response、usage 和不可變歷史；`negotiation_offers` 保存 Offer versions。

相同完成 Request 重播原結果，不再次付費。執行中重入回 `negotiation_in_progress`。啟動恢復會把不可安全重送的中斷 run 標成 `interrupted_by_restart`，不盲目再呼叫模型。完整測試見 [測試指南](TESTING.md)。
