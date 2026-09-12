# Buyer / Seller 協商模組

目前的五種經濟 Persona、條件交換、已登錄權益與對話報告見 [SELLER_PERSONAS.md](SELLER_PERSONAS.md)。展示 E2E 已改用 A 清庫／B 物流／C 組合／D 回購／E 售後；下文舊 C／D 組合與七筆 Offer 的實測紀錄屬歷史版本，請勿作為目前展示預期。

以已選好的 Orchestrator 候選清單為起點，每家建立一個 Buyer 與 Seller 實例。五家最多五輪；入選少於五家時只處理實際名單，不新增 Sponsored 分支。模組在 Backend 內呼叫，不新增網路服務。

## 執行

```bash
npm run demo:negotiate -- --offline
npm run demo:negotiate -- --live
npm run test:negotiation
npm run test:unit
npm run test:e2e
npm run test:e2e:live
```

`.env` 填入 `API_KEY`；範例檔依使用者指定命名為 `.env.expamle`。預設使用 `gpt-4.1-mini-2025-04-14`，可加上 `NEGOTIATION_MODEL` 指定其他支援 Structured Outputs 的模型。範例檔不可填真實 key。程式不輸出或保存 key。

未指定 `--offline`／`--live` 時，有 key 即呼叫 API，沒有則用固定策略。`--live` 缺 key 會明確報錯；API 失敗、拒答、不完整輸出或決策不合法會 fallback，終端每輪標示實際 provider。`--offline` 即使環境有 key 也完全不呼叫 API。加 `--memory` 可免落地資料庫。

Demo 使用 fixtures 的意圖及預先選好的五家 Seller，不代表 Orchestrator 已實作。每次建立新的 Request，將執行紀錄寫到 Git 忽略的 `data/negotiation.sqlite`；與 `data/offermesh.sqlite` 的既有靜態 Demo 分開。資料庫欄位由 `003_negotiation_runtime.sql` 定義。

`test:e2e`／`test:e2e:live` 使用使用者確認的五套展示配置，見 `contracts/fixtures/sales-profiles.json`：A 願意讓價、B 快速配送、C 免費送滑鼠墊、D 組合便宜 NT$30、E 固定價格。原始折扣排程／定價型態來自 `sellers.json`；展示檔設定加碼折扣、是否固定提供可選 bundle、配件 SKU 與展示說明。這些私有偏好先寫入 SQLite，再由 SellerAgent 讀取，不直接改寫 fixture 的歷史報價。

`004_seller_bundle_preferences.sql` 增加 `bundle_discount_twd` 與 `always_offer_bundle`。D 的單買價格下限會預留組合折扣，折扣後仍不低於主商品底價；C／D 的配件仍可拒絕，並各保留單買基準。E 的固定價格同時限制模型與 fallback。Canonical Demo 保持原本六個最終 Offer；展示 E2E 是五家、七個 Offer，按賣家分成五張方案卡。

E2E 每次使用獨立 `data/e2e-*.sqlite`，跑完關閉再重開，驗證結果重播且不再次呼叫模型。去識別化報告輸出到 `reports/negotiation-e2e/<run>/`，包含 `report.html`、`report.md`、`result.json`。HTML 可展開每張卡查看輪次、還價目標及 Offer ID；原始 prompts／底價只保存在本機 SQLite。

## Backend 入口

```js
import { negotiate } from '../src/negotiation/manager.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';

const result = await negotiate({
  requestId, buyerId, orchestration,
  repository: new NegotiationRepository(db),
  apiKey: process.env.API_KEY ?? '',
  onEvent: event => updateRequestProgress(event),
});
```

Backend 需先透過 migrations 初始化 DB，建立 `requests`，狀態為 `orchestrating` 或 `negotiating`，尚未發布。`buyerId` 必須来自已驗證的身份，不能直接相信 HTTP body。`orchestration` 遵守 `OrchestrationResult`，branches 必須是 pending、空歷史、連續 listing_rank 且 Seller ID 唯一。

意圖與偏好讀自 Request 的 SQLite 快照；商家商品、私有政策與庫存讀自 SQLite。外部呼叫無法用另一份意圖覆寫 Request。`NegotiationOutput` 回傳最新有效 Offer、合格／待確認 ID、Seller 狀態與用量；有合格方案時 status 為 `evaluating`，交給獨立 Evaluator，無合格方案則為 `needs_confirmation` 或 `no_match`。不排序、不採用、不兌換。

協商 Offer 以全域唯一 ID 保存在 `negotiation_offers`，完整歷史另存於 `negotiation_commits.state_json`，最終投影在 `negotiation_runs.final_json`。既有 `offers`／`negotiation_rounds` 表目前仍保存舊 Demo fixture；下游 Backend 必須使用本模組的最終投影，不能把 runtime ID 當作已寫進舊表。Acceptance／redemption 的持久化串接與重驗屬後續 Backend 整合，尚未由本模組提供。

## 時間與模型成本

`negotiate({ options })` 支援下列設定，啟動後以不可變 JSON 保存：

| option | 預設 |
| --- | ---: |
| `round_timeout_ms`（包含 Buyer + Seller） | 30000 |
| `global_deadline_ms` | 150000 |
| `model_timeout_ms`（單次模型呼叫） | 12000 |
| `max_calls`（模型 HTTP 呼叫次數） | 50 |
| `max_tokens`（保守預留額度） | 400000 |
| `max_output_tokens`（單次輸出上限） | 1200 |
| `offer_ttl_ms` | 600000 |

這些是可調初始值，並非量測後的效能承諾。每次模型呼叫先預留序列化 request 的 UTF-8 byte 數＋輸出上限＋1024 額外空間，使用保守上界避免平行呼叫超額。失敗／逾時仍保留預留值；實際 API 回報用量另記 `actual_tokens`，不假設逾時代表零費用。此上限約束客戶端模型 token 預留，並非帳戶金額預算。沒有自動重試。

## 議價與信任邊界

- Round 1 無競爭資訊。每輪結束後 Backend 驗證全部回應，再原子提交 context；下一輪只用上一輪的 revision。
- Buyer 模型只能選擇真實競爭方案的價格選項或停止，不能產生虛構報價。RFQ 送出前再次移除已失效來源。主商品和搭售價格分開，競爭價格不與另一筆交期拼接。
- Seller 模型只取得自己的 Catalog／policy、自己的舊方案與已去識別化 RFQ。商品、交期、條款和期限由 Backend 依目錄組裝；模型只能在私有底價與本輪折扣上限間提價，可選免費配件、refuse 或 final。無效決策使用固定策略。
- A 低價慢送、B 高價快送、C 免費可拒絕滑鼠墊、D 第三輪 final、E 第一輪 firm price。這些是 offline 策略；模型可更早 final 或拒絕，真實模型輸出不保證相同。
- 新商務版本配置新 ID，歷史不改寫。無效新提案不能取代舊有效方案；新的單買基準會使舊 bundle 失效，必須由 Seller 同輪重提 bundle。凍結時最多每家一個 standalone 與一個 bundle。
- Seller adapter 可透過 optional `withdrawn_offer_ids` 明確撤回自家舊方案，Backend 檢查 ID 歸屬並保留紀錄；模型預設採 offered／refused／final，refused 本身不會撤回舊方案。
- 硬條件、SKU 歸屬、庫存、底價、數量、交期、terms、期限與配件授權皆由 Backend 判定。未授權付費配件只能 needs_confirmation，不能進共享 context 或 eligible IDs。每輪及凍結時重讀庫存與履約狀態。
- final／refuse／error／round timeout 結束該分支；其他分支繼續。global deadline 或模型成本上限結束整場，保留仍有效候選。遲到回覆不能寫入已提交 context。
- `onEvent` 只傳狀態與正式 Offer，不傳私有 prompt、floor、Campaign 或競爭來源 ID。UI 仍從原 OrchestrationResult 顯示 Sponsored；Evaluator 不接收 Campaign。

## 持久化與恢復

`negotiation_runs` 保存 request-bound 輸入、Catalog 快照、固定 limits 與完成結果；`negotiation_commits` 每輪保存不可變 context、完整歷史、RFQ、Seller response、模型／prompt 版本、實際模型輸入／輸出與 usage。寫入不包住模型呼叫，SQLite busy 等待有界。

相同 Request 的完成結果直接重播，不重付模型費用；執行中重入回 `negotiation_in_progress`。整合 Backend 啟動、尚未接工作時呼叫 `repository.recoverInterrupted()`，將中斷工作標記 failed／`interrupted_by_restart`；不自動重送模型呼叫。歷史供 Backend 稽核，包含私有 Seller 輸入，**不可直接作為買家或 Seller 的 HTTP response**。

請求權限由 repository 查 buyer ownership；HTTP idempotency、身份認證及對外事件串流需由既有 Backend 整合。

## API 依據

使用 [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 的 Responses `text.format`、strict JSON schema，處理 refusal／incomplete／HTTP failure。預設模型 snapshot 見 [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。API 採內建 fetch，未引入新的 SDK 相依。

## 本次驗證（2026-09-12）

`npm test` 通過契約、SQLite 舊資料 migration 及 17 組協商測試，涵蓋隔離、barrier、final、refuse、逾時／遲到、模型失敗、呼叫／token 上限、硬限制、配件授權、失效庫存、撤回、不可變歷史、ownership、完成重播與中斷恢復。

以真實 API 跑五家最多五輪，28 次模型呼叫後產生 6 個合格方案，狀態為 evaluating；兩次 Buyer 呼叫使用 fallback，其餘成功使用模型。這是單次 smoke test，不能推論所有後續回應或延遲都相同。另執行離線 CLI 並重新開啟 SQLite，確認 24 個歷史 Offer 版本、6 個 context revisions 與 6 個最終方案已落地保存。

後續新增 25 組 unit tests，與原 17 組 integration tests、契約及 migration 測試全部通過。新增可重跑的 E2E harness，離線與真實模型均通過 14 項檢查。真實模型展示耗時 12.63 秒、32 次 API 呼叫，30 次採用模型決策、2 次越界報價被固定策略接手。五家最終結果：A 569、B 719、C 單買／贈品組合 610、D 單買 630／組合 600、E 679（TWD）。這是指定展示設定的單次結果，並非任意輸入都能產生五個合格 Seller 的保證。
