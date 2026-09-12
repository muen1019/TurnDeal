# Orchestrator 前段與 Seller 交接

文字入口現已由 `src/formatter/service.ts` 的 prepare_from_text 接上此流程；規則支援範圍與澄清方式見 [FORMATTER.md](FORMATTER.md)。以下「自然語言 Formatter 不在本模組內」指 handoff.ts 的責任邊界，不代表整個 repo 尚未提供 Formatter。

## 已實作的範圍

已解析的 Request（SQLite）→ 固定偏好快照 → DiscoveryQuery → 120 筆搜尋排名 → 合格 Seller 的 OrchestrationResult / SellerRFQ → 真正的函式 registry → 平行呼叫第一輪 → 原始回應稽核。

不是 HTTP；不用等 UI，也不需要 OpenAI API。自然語言 Formatter、第二至第五輪 Buyer 策略／同步排程、完整 Offer 商務驗證、正式 offer_id、Evaluator 與下單不在這個前段接線模組內。

## Tech Lead 呼叫方式

```ts
import { createOrchestratorHandoff } from './src/orchestrator/handoff.ts';

const service = createOrchestratorHandoff({
  db, userId: authenticatedUserId,
  timeoutMs: 3000, // 本例每次呼叫 3 秒；不是完整五輪的 SLA
  registrations: [
    { seller_id: 'discovery_seller_01', snapshot_id: 'discovery_demo_v02', handle: seller01Handler },
    // 加入其他已完成設定的 Seller handler
  ],
});
const plan = service.prepare({
  request_id: requestId, snapshot_id: 'discovery_demo_v02',
  idempotency_key: 'prepare-001',
  target_total_twd: 800, // 選填，僅供探索排序
});
const untrustedResults = await service.dispatch_first_round({ handoff_id: plan.handoff_id });
```

| 接口 | 用途 |
| --- | --- |
| `toDiscoveryQuery(intent, target?)` | 將契約 NormalizedIntent 的硬限制、完整商品偏好、交易優先順序轉成搜尋條件 |
| `buildSellerRFQ(requestId, intent, candidate)` | 只接受可議價商品，白名單產生第一輪 SellerRFQ |
| `service.prepare(args)` | 讀取使用者自己的 Request，搜尋、建立 RFQ，保存可重播的交接計畫 |
| `service.dispatch_first_round({handoff_id})` | 從 DB 載入自己的計畫，呼叫 Seller 函式並保存回應；不接受外部任意 RFQ |

`plan` 是 Backend-only：包含 `discovery`、`orchestration`、`rfqs`、`product_bindings`、`intent_snapshot`。不得整包交给 Seller 或 UI。

## 給 Negotiation owner 的函式

```ts
import type { SellerHandler } from './src/orchestrator/handoff.ts';

export const seller01Handler: SellerHandler = async (rfq, { signal }) => {
  // 1. 驗證 rfq.seller_id 與自己一致，只讀自己的 Catalog／私有策略。
  // 2. 按 rfq.round 執行該輪議價；遵守 AbortSignal。
  // 3. 回傳共用 SellerNegotiationResult，不回傳正式 offer_id。
  return {
    request_id: rfq.request_id, seller_id: rfq.seller_id, round: rfq.round,
    outcome: 'refused', is_final: false, drafts: [], message: '尚未設定議價策略',
  };
};
```

上例只示範介面，不是已完成的 Seller。正式 handler 的 offered 分支需回 SellerOfferDraft；只有 offered 可以 is_final=true。共用 schema：`contracts/a2a-commerce.v0.2.schema.json` 的 SellerRFQ、SellerNegotiationResult、SellerOfferDraft。

registry 不只是字串名單，必須給真正的 `handle` 函式並綁定 Catalog snapshot。缺少 handler、快照不符、違反硬條件、含稅運費未知者不派發。不因 handler 缺席或第一輪失敗而自動補派其他賣家；可能少於五家。原始五張搜尋卡片仍可供後續 UI 轉換使用。

## ID 與條款交接

- RFQ 的 `candidate_product_ids` 沿用 Discovery 商品的 `product_id`（例如 model_2）；賣家必須以 **snapshot_id + seller_id + product_id** 查自己的刊登，而不是拿 model_2 去 legacy products 表查。registry 已在初始化綁 snapshot_id，故 RFQ 不另加不相容欄位。
- `plan.product_bindings` 保存 listing_id 對應；私有政策仍以 listing_id 查找。當前測資每個 Seller 的 model 只有一筆刊登；新增同款多刊登前須升級此對應規則，前段會拒絕歧義。
- discovery_seller_01 不等於 seller_a；不會自動套用 canonical 五家策略。
- SellerOfferDraft 的 terms_id 必須由議價負責人對應其真實／模擬條款，之後 Backend 驗證其歸屬。本模組不虛構條款，也不將新 Discovery ID 寫進 legacy 正式 offers 外鍵。
- 只有填完且驗證通過的政策才能在正式 Backend 註冊；模板 draft 不能因寫上 seller_id 就當成可議價。測試範例的替身註冊僅限測試。

## 偏好與隱私

- 讀取 Formatter 已保存的 NormalizedIntent.product_preferences：required 成為硬限制，preferred 進入偏好分數，支援 in / not_in / range；缺資料不算符合硬限制。多值條件不會被壓成一個值。
- 長期偏好需在 Request 建立／Formatter 階段整合進此固定快照，本段不讀最新 user_preferences 覆蓋舊需求，避免同 Request 隨後排序改變。
- price_first / delivery_first / trust_first 將對應有效分項的基礎權重乘 2，再正規化。trust_first 使用市場評分，不假造個人信任紀錄。目標價格省略時，價格權重仍是 0。
- 搜尋目標價選填；**既有 NormalizedIntent 契約仍要求 max_total_twd、delivery_days_max**。本段不臆造缺失值；尚未完成解析的需求會報錯，不代表已完成「完全無預算的整條議價流程」。
- RFQ 的 target_total_twd 固定 null；不把私人最高預算或搜尋目標價當成允許揭露的還價。移除 source_text、需求原文、Campaign、信任與其他賣家資料。實際 Buyer 還價策略由議價模組另接。

## 儲存與失敗

`003_orchestrator_handoff.sql` 新增 orchestrator_handoffs；plan 與 discovery_run 在同一交易保存，內含需求 revision、query、Catalog snapshot、RFQ 與凍結的 timeout。

相同 user + request + idempotency_key + 輸入重播同 plan；同 key 不同輸入拒絕。第一輪以 prepared → dispatching 原子取得執行權；完成後變 dispatched 並重播 results，不重複呼叫 Seller。程序在 dispatching 時崩潰會保留該狀態，需人工處理，不自動冒險重送。

同輪平行、每支最多一次呼叫。timeout 觸發 AbortSignal 並忽略遲到結果；handler 必須合作取消，無法強制中止同步阻塞或已發生的外部副作用，禁止在此 handler 做購買。例外／格式錯誤／request 或 seller 或輪次不一致轉成隔離的 error，不影響其他分支，也不回傳內部 exception 細節。

結果僅通過 JSON Schema、身份及主商品範圍檢查，**仍是不可信草稿**。價格、庫存、期限、搭售授權、條款等完整資格驗證與正式 Offer 儲存是後續 Backend 工作；不得直接送 Evaluator 或當成可購買報價。

## 驗證

```bash
npm ci
npm run test:orchestrator
npm run demo:handoff
npm test
```

Demo 使用記憶體 SQLite，從 fixtures 初始化；五家 Seller 使用明確標示的拒絕替身，不覆蓋本地 DB、不啟用待填策略。新 DB 的 db:init 會跑全部 migration；既有本地 DB 用 `npm run db:migrate`，會先以 VACUUM INTO 備份到被 Git 忽略的 data/backups，再套用 migration，不刪除資料、不重新 seed。舊 DB 的 canonical 資料數量可能不同於新版測資，因此 db:check 的固定 seed 數量檢查不適用；migrate 本身會檢查完整性與外鍵。
