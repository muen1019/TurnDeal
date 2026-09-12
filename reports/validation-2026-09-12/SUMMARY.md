# Evaluator 與整合 E2E 測試報告

2026-09-12（Asia/Taipei）。基於遠端 `cdce6e5`，保留本地協商開發。沒有 commit 或 push。

## 最終結果

- [完整真實模型報告（五套方案、七個 Offer、逐輪紀錄）](../full-e2e/live-2026-09-12T05-24-09-590Z-c6a0f149/report.html)
- [真實模型 Markdown 報告](../full-e2e/live-2026-09-12T05-24-09-590Z-c6a0f149/report.md)
- [離線 E2E 報告](../full-e2e/offline-2026-09-12T05-25-13-158Z-c7fe4944/report.html)
- [npm test 完整輸出](npm-test.txt)

| 測試 | 結果 |
| --- | --- |
| 契約與 fixture | PASS |
| SQLite migration、完整性、外鍵、不可變快照 | PASS，26 個資料表 |
| 遠端 Discovery／Orchestrator／handoff | 11／11 |
| Seller policy | 3／3 |
| Buyer／Seller／validator／model unit tests | 25／25 |
| 協商整合測試 | 17／17 |
| Evaluator unit／整合測試 | 15／15 |
| 自動測試總計 | **71／71**（另有契約、資料庫檢查） |
| 真實模型 E2E | **19／19** |
| 離線 E2E | **19／19** |

真實模型 E2E 在 13:24:09 開始，耗時 11.11 秒。Buyer／Seller 使用 `gpt-4.1-mini-2025-04-14`，22 次 API 呼叫、24,496 個 API 已回報 tokens；Evaluator 使用 `gpt-4.1-2025-04-14`，1 次呼叫、2,684 tokens，耗時 3.29 秒。合計 23 次呼叫、27,180 tokens，非帳單費用估算。

## 五套方案（價格優先）

| 排名 | Seller 偏好 | 建議方案含稅運 | 到貨 | 可選方案 |
| --- | --- | ---: | --- | --- |
| 1 | A 願意讓價 | NT$569 | 5 天 | 單買 |
| 2 | D 組合更便宜 | NT$600 | 2 天 | 滑鼠＋滑鼠墊；單買 NT$630 |
| 3 | C 免費周邊 | NT$659 | 3 天 | 單買或同價附滑鼠墊 |
| 4 | E 固定價格 | NT$679 | 4 天 | 單買，第一輪 final |
| 5 | B 快速配送 | NT$730 | 1 天 | 單買；Sponsored 未改變推薦 |

完整 Offer 順序為 A 單買 → D 組合 → D 單買 → C 單買 → C 組合 → E → B。五張卡依各 Seller 排名最高的 Offer 分組；D 單買的獨立排名仍然保留。C 同價時不因贈品自動獲得加分，使用者仍可選同價 bundle。

本次 D 第三輪模型遺漏搭售選項，Backend 拒絕該決策並由固定策略提供 NT$630 單買／NT$600 組合。Evaluator 正常採用真實模型輸出，沒有 fallback。

## 驗證範圍

起點是 fixture 已解析需求寫入 SQLite → 遠端原有 `handoff.prepare()`／Discovery → 五輪協商 manager 透過已註冊 Seller 函式執行 → Backend 產生不可變 Offer → Evaluator → RequestSnapshot → SQLite 關閉、重開、重播。

僅以測試 harness 組合既有模組；沒有新增 production Formatter 或 Orchestrator 接線。遠端僅執行第一輪的 dispatcher 沒有再呼叫一次，以免重複第一輪，其行為由原有 handoff tests 驗證。15 家匯入 Seller 的 draft 政策沒有啟用；本次使用已確認的 canonical A–E 示範策略。

Evaluator 依明確偏好規則先排列輸入，再由真實模型回傳完整排名與解釋，Backend 驗證集合、順序及常見數字矛盾。它不自行發明權重。完整七個 Offer 都保留；不會自動選定、接受或購買。

此外驗證了：模型輸出未知／漏列／重複 ID、空白原因、錯誤排名；逾時、拒絕、截斷、HTTP 錯誤；價格與交期說明；Sponsored／底價隔離；庫存或條款改變、推論期間過期；已失效報價不得因補貨復活；跨買家存取；併發呼叫；中斷恢復；重播不重複付費。

HTML 已在瀏覽器核對五張排序卡及完整七個 Offer；本次說明文字中的金額、交期與價差已人工逐項對照。自然語言驗證器處理已知錯誤模式，不能證明所有可能文字都正確。

## 開發過程發現並修正

1. [第一次完整 live](../full-e2e/live-2026-09-12T05-17-56-530Z-3690e4dd/report.md)：模型違反偏好順序，安全 fallback 生效，未通過「採用模型輸出」檢查。
2. [第二次 live](../full-e2e/live-2026-09-12T05-19-53-213Z-3d344830/report.md)：自動排名檢查原先通過，人工發現將 569 元寫成 570 元、2 天稱為最快。該報告已標示文字驗收失敗。新增數字／比較說明驗證。
3. [第三次 live](../full-e2e/live-2026-09-12T05-22-59-777Z-739ba109/report.md)：驗證器把「比最快配送慢」的合理比較誤認為最快宣告；透過本地 audit 定位，修正比較語句判別並加入 regression test。
4. 最終 live 通過上述檢查；離線流程也重新驗證。失敗報告保留，沒有以最後結果覆蓋歷史。

## 實際限制

- 這不是自然語言 Formatter、HTTP、正式 UI 操作、Swipe 或交易兌換的驗收。
- Seller 商品與私有銷售策略是虛擬商家測資，實際模型議價結果可能提前 final，價格與輪數不保證每次一樣。
- 目前共用 EvaluatorInput 不含商品屬性與完整保固條款，Backend 驗證必要屬性；軟性外形／尺寸偏好的進一步模型排序需另行擴充契約。
- 歷史報告保留原有效期限；重播不延長 Offer。未來採用／兌換必須再次檢查。
- API key、SQLite runtime 與 raw private prompt 沒有放進公開報告或 Git；`.env` 仍被忽略。

重跑：`npm test`、`npm run test:e2e:full`、填妥 `.env` 後執行 `npm run test:e2e:full:live`。
