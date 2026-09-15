# TurnDeal frontend

React／TypeScript／Vite 單頁介面，包含初次 Buyer 設定、直接需求輸入、模型選擇、Formatter 問答、Agent 進度、Seller／輪次狀態、Offer swipe、versioned Improver、歷史紀錄與 ACP 測試結帳。

## 啟動

完整應用從 repository root 使用 Node 24：

```powershell
npm run dev
```

開啟 <http://127.0.0.1:5173/chat>；`/api` 代理到 integrated runtime 3201。Live model 使用 root `npm run dev:secure`，API key 不得進入 Vite environment。

Frontend package 使用 Node 20.19.5。若單獨啟動：

```powershell
npm ci
$env:OFFERMESH_API_ORIGIN = 'http://127.0.0.1:3201'
npm run dev
```

`OFFERMESH_API_ORIGIN` 不含 `/api`。HTTP 定義來自 [OpenAPI](../backend/openapi.json)，型別與 runtime validation 使用 [v0.3 contract](../contracts/a2a-commerce.v0.3.schema.json)；`npm run generate:types` 更新生成檔。

## UI workflow

- 首次進入明示保存 Buyer profile、收件資料、偏好權重與顏色；基本資料不進模型。
- Chat 可直接提交本次需求，不必先儲存 intent template。已儲存 template／preference 才會套用。
- UI 依 `RequestSnapshot.status` 顯示 formatting、orchestrating、negotiating、evaluating 與結果，不用假計時器推測完成。
- `needs_clarification` 顯示 Backend 問題與可編輯快捷答案，回答後建立 linked child Request。
- 左滑保存在本機 skipped state；右滑或按鈕提交 versioned accept。全部拒絕可啟動 Improver，但不能同時建立 legacy refinement child。
- `next_request_id` 非空才開啟改善後的新一輪。
- Accepted Offer 可進入測試結帳，保存收件資料、明確確認或取消，並從權威 Purchase state 恢復。
- POST recovery journal 保存 stable key／exact body；未知結果鎖定重複操作並核對原提交。
- 歷史清除只刪除本分頁 sessionStorage，不刪 SQLite Request、Offer、decision 或 purchase audit。

## Progress

正式 UI 只投影 `GET /api/requests/{request_id}` 的 snapshot status，不發出額外 `/progress` request。Vite mock 與 `/__mock` sidecar 已移除；development 與 production 使用相同 runtime API。

百分比是階段估算，只有 `awaiting_user` 才顯示完成。失敗、待澄清或結果未知時不得顯示成功。

## Mobile

`npm run dev:mobile` 提供 isolated offline mobile flow；`npm run dev:mobile:secure` 提供配對後的 live-model development flow。兩者都不是正式公開服務。操作與安全限制見 [mobile UI](../docs/MOBILE_UI.md) 和 [mobile live mode](../docs/MOBILE_LIVE.md)。

## 驗證

```powershell
npm test
npm run typecheck
npm run build
```

Browser suites 從 root 執行，完整命令見 [測試指南](../docs/TESTING.md)。輸出位於被 Git 忽略的 `test-results/`。

設計參考位於 `img/design/`；curated mobile screenshots 位於 [docs/screenshots/mobile](../docs/screenshots/mobile/README.md)。尚未完成的細部驗收保留在 [OpenSpec tasks](../openspec/changes/define-offer-result-ui-api/tasks.md)。
