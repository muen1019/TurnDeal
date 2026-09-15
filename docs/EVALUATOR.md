# Independent Evaluator

`src/evaluator/index.mjs` 的 `evaluate` 只讀取已完成且持久化的 negotiation run。呼叫端不能直接提供 Offers、Campaign、prompt、floor price 或排名。

## 流程

1. 驗證 buyer ownership、Request 與不可變 negotiation provenance。
2. 重新檢查硬限制、庫存、Seller、terms、expiry 與 bundle consent。
3. 將既有 `EvaluatorInput` 白名單投影送入獨立 Responses call。
4. 驗證回傳是全部 eligible IDs 的完整 permutation、連續 rank、理由與偏好順序。
5. 發布前再次檢查資格；若 inference 期間集合變動，以當下集合重建 deterministic ranking，不再呼叫模型。
6. 保存不可變 `RequestSnapshot`，並按 Seller 以最高順位 Offer 分組；其他 variant 保留為 alternative。

Campaign 與私有 Seller policy 永遠不進入 Evaluator input。Structured Outputs 唯一允許的格式是 `contracts/openai/evaluator-output.schema.json`。

## 排名

Deterministic fallback 依 `intent.preferences` 的明示順序逐項比較：

- `price_first`：較低含稅運總價；
- `delivery_first`：較快到貨；
- `trust_first`：個人 band／rating，再比較 marketplace rating；
- `after_sales_first`：Backend 已驗證並出現在 Offer 的售後條件。

未明示順序時使用 price、delivery、trust。其餘 tie-break 依 delivery、trust、standalone before bundle、stable Offer ID。免費贈品不自動加分；已授權且更便宜的 bundle 保留價格優勢。

Evaluator 不從 SKU ID 推測顏色／尺寸，也不從 terms ID 推測保固。Required attributes 由 Backend 先驗證；要新增 soft attribute ranking 必須先審查並升版 input contract。

## 模型與失敗

預設 Evaluator model 為 `gpt-4.1-2025-04-14`，可用 `EVALUATOR_MODEL` 覆寫。單次 call、20 秒 timeout、2,500 max output tokens，無自動 retry。缺 key、HTTP failure、timeout、refusal、截斷、schema 或 set validation 失敗都使用 deterministic fallback。

`evaluation_runs` 防止並行重複付費。完成結果從 SQLite 重播；重播歷史 snapshot 不會刷新 Offer expiry 或授權購買。中斷 evaluation 在啟動時標為 failed，不自動發出新的 paid call。

## 驗證

```powershell
npm run test:evaluator
npm run test:e2e:full
```

Live full E2E 需明確提供 server-side key：`npm run test:e2e:full:live`。產生式報告只留在本機；政策見 [測試指南](TESTING.md)。
