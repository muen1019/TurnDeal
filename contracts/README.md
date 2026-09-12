# A2A Commerce shared contracts v0.2

`contracts/` 是四個模組共同使用的資料邊界。API 與內部函式均傳 JSON 值，不傳 filesystem path，也不讓任一模組自行增加未定義欄位。

v0.2 遷移五家 Seller、最多五輪、明確 final 與 Backend 停止原因。本次依使用者確認的新版 spec，新增 optional `SellerRFQ.competitive_terms`、`SellerNegotiationResult.withdrawn_offer_ids`，以及 `CompetitiveOfferReference`、`SharedNegotiationContext`、`NegotiationOutput`。舊 payload 可省略 optional 欄位，既有 fixtures 仍有效；新增 `fixtures/negotiation-sharing.json` 驗證上一輪來源與去識別化邊界。Evaluator 契約不變。[目標 System Design](../docs/SYSTEM_DESIGN.md) 的 Swipe、文件修訂與長期偏好尚未遷移。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `a2a-commerce.v0.2.schema.json` | 完整共用型別。root 驗證 `RequestSnapshot`，其他型別用 `#/$defs/<Type>` 引用 |
| `openai/evaluator-output.schema.json` | 可直接放入 Responses API `text.format` 的 Evaluator Structured Outputs 格式 |
| `fixtures/marketplace-source-snapshot.json` | Shopee、Amazon 與官方規格的公開來源快照，含幣別與新鮮度 |
| `fixtures/MARKETPLACE_DATA.md` | 真實公開欄位、模擬商務欄位與更新來源的規則 |
| `fixtures/sellers.json` | 五家 Seller、真實商品 Catalog、模擬庫存／底價／信任與 Campaign |
| `fixtures/happy-path.json` | 五家 Seller 的最多五輪議價（A／B／C 五輪、D 三輪、E 一輪）、凍結快照與最終排序 |
| `fixtures/demo-scenarios.json` | 價格／交期偏好、無結果、timeout、拒絕、過期與模型攻擊等 10 組情境 |
| `fixtures/edge-cases.json` | 超預算、錯誤交期、過期、未授權加購與不存在 ID 的安全測試 |
| `fixtures/api-examples.json` | 四個 HTTP endpoint 的 request、response 與 idempotency 範例 |

## 模組交接格式

| Producer | Consumer | Schema definition |
| --- | --- | --- |
| API client | Formatter | `CreateRequest`, `DocumentBundle` |
| Formatter | Orchestrator | `NormalizedIntent` |
| Orchestrator | Seller branch | `SellerRFQ` |
| Seller branch | Backend validator | `SellerNegotiationResult` |
| Backend validator | Evaluator | `EvaluatorInput` |
| Evaluator | Backend output validator | `EvaluatorOutput` |
| Backend | UI | `RequestSnapshot`, `DecisionResult`, `RedemptionReceipt`, `ErrorResponse` |

## 共用慣例

### v0.1 → v0.2 交接

- 共用 schema 路徑改為 `a2a-commerce.v0.2.schema.json`；所有 Round 共用 `NegotiationRound`（整數 1～5），SellerAgent.rounds 最多五筆。
- OrchestrationResult／RequestSnapshot 的 seller_agents 最多五家。Backend 依自然排序選前五家合格 Seller，不足五家依實際數量；seller_id 唯一、listing_rank 從 1 連續，每家一個 Buyer Agent。Sponsored 只能引用已選名單，不得增加分支。
- SellerNegotiationResult 與 SellerRound 新增必填 `is_final`；只有 offered 可以為 true。SellerAgent 新增必填 `stop_reason`：進行中為 null，結束時為 seller_final／refused／timeout／error／no_adjustment／max_rounds／global_deadline／call_budget／token_budget，由 Backend 決定。
- `status=offered` 表示取得報價，是否還會派發下一輪看 stop_reason。單一 final／失敗僅關閉該分支；保留有效最後報價，其餘繼續至各自停止或第五輪。Backend 接受停止建議才可記 no_adjustment。
- Seller 私有測資以五個非遞減整數的 `round_discounts_twd` 取代 round_1_discount_twd／round_2_discount_twd，`final_round` 為 1～5 或 null（null 代表未預先宣告 final）。Fixture revision 為 0.3，公開來源快照仍為 0.2；兩者不等於契約版本。
- SQLite 透過 `002_five_seller_negotiation.sql` 擴充。既有發布快照與報價保持不可變；目前 Demo 由 migrations＋fixtures 重建，不將歷史快照冒充新版 payload。

以上是契約、固定交換紀錄與資料庫的交接規則；同步 barrier、實際計時／成本控制與完整 Backend pipeline 仍待實作。本次未改 Evaluator Structured Outputs 的形狀。

### 欄位與信任邊界

- ID 是 1 到 128 字元的不透明字串。消費端不得解析 ID。
- 時間是含 timezone 的 RFC 3339 字串。
- 金額是正整數 TWD，已含稅與運費。
- 公開 Marketplace 價格只是擷取當下的參考價，不等於 Seller 最終含稅運 Offer；來源與私有模擬欄位必須分開保存。
- 所有 object 預設 `additionalProperties: false`。
- `null` 與欄位省略不同。API response 依 schema 明確回傳 `null`。
- `offer_id` 對商品、價格、交期、條款與有效期限的組合不可變。任何商務條件改變都產生新 ID。
- `SellerNegotiationResult` 不包含 `offer_id` 或 eligibility。Seller 以 `draft_ref` 與 `baseline_draft_ref` 關聯同輪方案，Backend 驗證後才配置 immutable `offer_id` 並建立正式 `Offer`。
- `EvaluatorOutput` 只做排序與說明。Backend 必須檢查 ID 集合完整、無重複、rank 連續，再發布結果。

## OpenAI Structured Outputs

`openai/evaluator-output.schema.json` 使用嚴格模式需要的形狀：根節點是 object、所有 properties 都列入 required、每個 object 都設定 `additionalProperties: false`。模型拒答、輸出截斷、schema 不符或 ID 驗證失敗時，Backend 必須使用 deterministic fallback，不可發布部分排序。

## 驗證

```bash
npm run test:contracts
```

先執行 `npm ci` 安裝鎖定版本的 Ajv／ajv-formats。此命令驗證實際 JSON Schema 與跨物件規則，涵蓋五家／五輪上限、較少 Seller、final／失敗後不得再派發、Marketplace 來源引用、Seller 差異、硬限制、Sponsored 隔離與 Evaluator 排序。
