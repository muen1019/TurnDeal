# 測試指南

測試證據以可重跑的命令、fixtures 與 assertions 為準。日期化 pass count、HTML、JSON、log 和 screenshot 容易過期，不作為長期文件提交；產物輸出到被 Git 忽略的 `reports/` 或 `test-results/`。

## 完整回歸

```powershell
npm test
npm --prefix backend test
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run build
```

Root `npm test` 包含 contracts、SQLite、Orchestrator、Seller policies、unit、Negotiation、Evaluator、Formatter、runtime／purchase 與 Improver。

## 重點套件

| 範圍 | 指令 |
| --- | --- |
| 共用 schema／fixtures | `npm run test:contracts` |
| SQLite migrations | `npm run test:db` |
| Discovery／handoff | `npm run test:orchestrator` |
| Seller policies | `npm run test:seller-policies` |
| Negotiation | `npm run test:negotiation` |
| Evaluator | `npm run test:evaluator` |
| Formatter | `npm run test:formatter` |
| Integrated runtime／purchase | `npm run test:runtime` |
| ACP purchase only | `npm run test:purchase` |
| Improver | `npm run test:improver` |

契約或 fixture 改動至少執行 `npm run test:contracts`。Migration、狀態或持久化改動應執行完整 root suite。

## 端到端

```powershell
npm run test:e2e
npm run test:e2e:full
npm run test:e2e:catalog
npm --prefix frontend run test:e2e
npm --prefix frontend run test:api:e2e
```

Live negotiation／Evaluator 只有在使用者明確提供 server-side key 並接受 API 使用量時才執行：

```powershell
npm run test:e2e:live
npm run test:e2e:full:live
```

不要把 fallback 通過寫成 live provider 成功。報告需標明 offline／live、模型／fallback、是否包含 HTTP、browser 與 purchase。

## Browser runtime

先啟動 `npm run dev`，再執行：

```powershell
node tests/runtime-browser.mjs
node tests/turndeal-browser.mjs
node tests/mobile-browser.mjs
```

可用 `OFFERMESH_BROWSER_CHANNEL=chrome` 改用 Chrome。TurnDeal browser suite 覆蓋 clarification → Improver child → accept → simulated checkout → reload recovery；mobile suite 覆蓋 responsive journey。它們使用隔離資料與模擬付款，輸出只供本地除錯。

## 驗收原則

- 使用獨立暫存 SQLite，測完關閉；不要污染 `data/app.sqlite`。
- 驗證 idempotent replay、restart recovery、buyer isolation、immutable snapshot 與 late response。
- UI 至少覆蓋 Chat submit、輪次／branch 狀態、Offer details、skip／undo、accept／reject、reload、鍵盤、窄螢幕與 reduced motion。
- ACP 必須覆蓋 accepted-only、confirmation token、庫存／期限、並行、回應遺失、事件驗簽與重啟核對。
- 測試失敗時保留必要的單次本機 artifact；修復後不把整批產物加入 repository。
