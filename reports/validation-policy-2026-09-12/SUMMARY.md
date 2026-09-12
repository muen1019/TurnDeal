# Persona、合法議價範圍與偏好匹配測試報告

日期：2026-09-12。測試目前未提交的工作目錄；本次沒有 commit、push 或更改正式 HTTP／UI 接線。

## 結果

- Root 契約、DB 與回歸測試通過：117 項 Node tests。
- Backend：36/36 tests，build 通過。
- Frontend：81/81 tests，build／typecheck 通過。
- 合計：234 項回歸測試通過，另含 schema、migration、SQLite integrity／foreign key checks。
- Root Formatter／Orchestrator TypeScript 檢查通過，使用 TypeScript 5.9.2、暫存環境 @types/node 24.0.0、bundler resolution；未修改專案相依套件。最初誤用前後端 Node 20 型別的檢查缺少 node:sqlite，改用符合 root Node 24 的型別後通過。
- 最終真實模型售後 E2E：23/23，25.77 秒，34 次 Buyer/Seller＋1 次 Evaluator，零 fallback。
- HTML 在 1440px／390px 驗證五張卡、17 輪對話、偏好標籤，無水平溢出與頁面錯誤；實際檢視第一名 Seller 卡片。

## Demo 觀察

| Seller | 真實模型單買價 | 具體差異 | 價格優先排名 | 售後優先排名 |
| --- | ---: | --- | ---: | ---: |
| A 清庫 | 559 | 609 → 599 → 589 → 579 → 559；每次在合法範圍內選價 | 1 | 5 |
| B 物流 | 799 | 一天交期、已登錄到貨承諾與晚到補償 | 4 | 3 |
| C 組合 | 629 | 669 → 659 含贈品 → 629 不含贈品；保留 649 組合需加價授權 | 2 | 4 |
| D 回購 | 709 | 下次券 50 元與退貨期延長至 30 天；券不扣本次價格 | 3 | 2 |
| E 售後 | 899 | 保固總期 730 天、一天內客服回覆、30 天瑕疵換貨 | 5 | 1 |

C 的 659 → 629 包含當輪普通價格改善 10 元及取消贈品額外折讓 20 元；不是 30 元全部來自贈品交換。模型沒有用滿 30 元交換上限。A 的真實路徑也不同於離線固定排程 609 → 594 → 579 → 564 → 549。

價格及售後兩種請求使用同一組預先配置的 Persona，未在選出後重新分派。Discovery 只使用公開價格／服務條件；Evaluator 使用實際談成的權益。報告對話是結構化決策的可讀投影，不是模型逐字稿。

## E2E 紀錄

| 執行 | 檢查 | 耗時 | 模型呼叫合計 | 備援 | API 已回報 tokens |
| --- | --- | ---: | ---: | --- | ---: |
| [真實價格優先](../full-e2e/live-2026-09-12T07-08-13-873Z-4c2895e6/report.html) | 23/23 | 39.87 秒 | 35 | 4 次 Buyer model_timeout；Seller 與 Evaluator 使用模型 | 58,167 |
| [真實售後優先，修正前](../full-e2e/live-2026-09-12T07-08-54-839Z-a503da6f/report.html) | 23/23 | 19.09 秒 | 35 | 1 次 Buyer 回傳 negotiate＋null proposal，被驗證拒絕後備援 | 62,077 |
| [真實售後優先，修正後](../full-e2e/live-2026-09-12T07-11-29-470Z-4d3d4690/report.html) | 23/23 | 25.77 秒 | 35 | 0 | 62,307 |
| [離線價格優先，最終程式](../full-e2e/offline-2026-09-12T07-13-16-025Z-c21cdf83/report.html) | 23/23 | 0.40 秒 | 0 | 預期 deterministic 路徑 | 0 |
| [離線售後優先](../full-e2e/offline-2026-09-12T07-08-04-720Z-f955a5fd/report.html) | 23/23 | 0.35 秒 | 0 | 預期 deterministic 路徑 | 0 |

本次共三次 live 執行，105 次模型呼叫，API 已回報 182,551 tokens。逾時呼叫可能已在遠端產生費用但未回報 usage，這不是帳單金額或所有可能計費 token 的保證。沿用固定 12 秒模型 timeout、50 次協商呼叫上限及 400000 token 保守預留；不為了測試自動放寬預算或重試單次模型呼叫。

Buyer 的空提案問題已先以測試重現，再將不能停止時的 Structured Outputs proposal 改為必要物件；沒有把非法輸出當作成功。價格優先那次的逾時按原有安全備援處理，不改寫或隱藏紀錄。

## 測試涵蓋

- 同一 Persona 可選擇不同合法價格，仍維持指定 SKU、價格保護與 TTL。
- 商品／物流／贈品／服務成本、最低政策貢獻率與合計讓利上限。
- 單買合法但贈品組合超出整體成本預算時，Backend 拒絕組合。
- 未登錄券、假服務條款、失效履約證據、缺庫存、贈品反覆折現、未授權加購。
- 達最多讓步次數即停止；同一請求重播不追加協商。
- 賣家資訊讀取持久化 Persona，不輸出私有成本／策略。
- 售後偏好使用有效 included 服務條件；Persona 名稱、negotiable 或過期承諾不加分。
- 明確價格優先與目標價接近度分開，沒有目標價仍可比較低價。
- 中文售後／價格偏好經 Formatter 保留至 Discovery；無法表達的售後硬限制要求澄清。
- Evaluator 排序完整合格 ID 集合，售後優先與價格優先產生不同結果；不改動 Structured Outputs 輸出形狀。

## 執行範圍與限制

完整測試從中文需求經規則 Formatter、SQLite、既有 handoff.prepare／Discovery、五家模型協商、Backend 驗證、Evaluator 到快照與重播。未呼叫真實模型 Formatter、操作正式 UI、付款或兌換。

履約證據與成本皆為 synthetic 模擬。售後分數比較已登錄的權益維度，不代表真實商家履約保證；公開條件仍列出除外事項。報價可用量檢查不等同跨請求庫存預留。

完整 22 因素的通用規則引擎尚有後續擴充，例如地區／截單物流、任意會員分群與活動條件、多券疊用及交易預留；本次完成的具體功能與資料口徑以 [SELLER_POLICY_IMPLEMENTATION.md](../../docs/SELLER_POLICY_IMPLEMENTATION.md) 為準。

## 驗證產物

- [Root tests](../policy-root-tests.log)
- [Backend build](../policy-backend-build.log)、[Backend tests](../policy-backend-tests.log)
- [Frontend build](../policy-frontend-build.log)、[Frontend tests](../policy-frontend-tests.log)
- [Root TypeScript check](../policy-root-typecheck.log)
- [Visual checks](visual-check.json)、[Desktop screenshot](../full-e2e/live-2026-09-12T07-11-29-470Z-4d3d4690/preview-1440.png)、[Mobile screenshot](../full-e2e/live-2026-09-12T07-11-29-470Z-4d3d4690/preview-390.png)
