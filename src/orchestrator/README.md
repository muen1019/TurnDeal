# Orchestrator 資料接口 v0.1

新增的前段整合入口為 `handoff.ts`：需求與偏好 → Discovery → RFQ → 真正 Seller handler 第一輪呼叫。完整交接與範例見 [ORCHESTRATOR_HANDOFF.md](../../docs/ORCHESTRATOR_HANDOFF.md)，可用 `npm run demo:handoff` 不依賴前端測試。

供 Orchestrator 開發者直接 import 的 TypeScript service。沿用現行 v0.2 的偏好格式；不自動採用 System Design 尚未遷移的 explicit/behavioral 或 Shared Context 欄位。

## 快速開始

使用 Node.js 24，可直接執行這些 TypeScript 檔案（原生型別移除；不是 TypeScript 編譯器型別檢查）。

```sh
npm run db:init
npm run demo:orchestrator
npm run test:orchestrator
```

既有資料庫不必重新初始化。完整呼叫範例見 `examples/orchestrator-input.ts`。

```ts
import { createOrchestratorDataTools } from './data-tools.ts';

const tools = createOrchestratorDataTools({
  db,                              // Backend 持有的 DatabaseSync connection
  userId: authenticatedUserId,      // Backend 綁定，不由模型傳入
  registeredSellerIds,             // 實際已註冊的議價 handler IDs
});
const input = tools.load_discovery_input({ request_id, now });
// 開發者在此接自己的 discover_and_rank(input)，回傳現行 OrchestrationResult。
```

## 接口

| 函式 | 參數 | 結果 |
| --- | --- | --- |
| `get_request_context` | `{request_id}` | 需求文件、Request revision、status、NormalizedIntent 或 null |
| `get_request_preferences` | `{request_id}` | 本次 preference_md、商品偏好、交易偏好、搭售政策 |
| `list_catalog` | `{category, seller_id?}` | 商品／Seller 對應、規格、標價、庫存、交期、條款 ID、來源 IDs |
| `list_sellers` | 無 | Seller 名稱、是否啟用、是否已註冊 handler |
| `get_seller_trust` | `{seller_id}` | 個人及市場評分摘要 |
| `list_active_campaigns` | `{category, now}` | 生效中的 Campaign；尚未限定合格 Seller，也尚未選得標者 |
| `load_discovery_input` | `{request_id, now}` | 用同一次 SQLite read snapshot 取得以上探索輸入 |

所有函式同步回傳可 JSON 序列化的 object/array，也可以用 await 呼叫。連線由呼叫端關閉。每個 SQL 參數均綁定；資料接口不修改資料表。

錯誤為 `DataToolError`，code：`invalid_argument`、`not_found`、`intent_not_ready`。查不到 Request 與不屬於目前使用者的 Request 都回 not_found。個別讀取函式的結果不保證來自同一資料庫時間點；整合流程請使用 load_discovery_input。

## 由 Orchestrator 實作的下一層

1. 選啟用且有 handler 的 Seller；同一 SKU 必須符合全部硬規格。
2. 排除缺貨、已知太晚到貨；保留排除原因。不可單憑標價超預算排除。
3. 依軟偏好、信任、評分等規則排序所有合格 Seller。
4. Campaign 必須再與合格 Seller 交集，才可選 Sponsored；不可更改自然排序。
5. 回傳 schema 的 `OrchestrationResult`；探索初始 status=pending、rounds=[]、final_offer_ids=[]。
6. handoff.ts 已接上 Request → DiscoveryQuery → OrchestrationResult / SellerRFQ 與第一輪 handler dispatch；後續議價策略、多輪排程及完整 Offer 驗證仍由後半段接續。

## 資料邊界與目前限制

- 這是一組 Backend 內部資料接口，含使用者需求、信任與 Campaign；不可整包交給 Seller 或 Evaluator。
- Catalog 回傳全部同類 SKU，包含白／粉／紅色和缺貨商品，讓 Orchestrator 可生成排除原因；不含底價或私有折扣策略。
- 現有 sellers 表的個人評分是全域 Demo 測資。只有明確設定 demoTrustUserId 且符合目前 userId，才載入；其他使用者回 neutral/null/0。真正多使用者評分需要 buyer-seller 關聯表。
- get_request_preferences 讀取 Request 固定版本，長期 user_preferences 更新不會覆蓋它。資料庫尚未有長期 Markdown revision，因此不宣稱提供 get_preference_snapshot 的版本功能。
- load_discovery_input 保證單次讀取一致；尚未保存 Catalog 歷史版本。正式議價前應由 Backend 保存所用探索快照。
- Node 原生執行驗證與測試已提供；尚未配置 tsc。工具傳入值須遵循匯出的型別，若日後直接開放模型呼叫，再加完整 tool schema dispatcher。
