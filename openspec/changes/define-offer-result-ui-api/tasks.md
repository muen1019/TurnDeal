可重跑驗證見 `docs/TESTING.md`。第 4–6 批包含本次 API 整合以外的細部視覺與裝置驗收，未完整驗收的項目保留未勾選；本 change 不 archive。

前端驗證命令見 `docs/TESTING.md`。使用者最新 UI 調整已實作：滿版水藍、整頁零捲動、元件內捲動、移除技術資料呈現。未勾選項目仍含尚未完成的完整驗收矩陣；不以主要流程通過代替真機與逐幀驗證。

## 1. 契約遷移與工程基礎

- [x] 1.1 為 reject=200/rejected、RejectDecisionResult.source_documents 與 RequestSnapshot.decision 升版共用 Schema；同一 PR 同步 OpenAPI、fixtures、驗證器及受影響 owner 文件，保留 v0.1 舊語意；通過 npm run test:contracts，明列三個 Result HTTP 操作與移出範圍的 redemption。
- [x] 1.2 建立 backend/ Express 5＋TypeScript＋SQLite、frontend/ React＋TypeScript＋Vite 與各自 lockfile、Node >=20.19.0 <21 設定；實跑 typecheck/test/build。
- [x] 1.3 從升版契約產生型別與執行期驗證；測試 snapshot.decision 的狀態／request_id／文件一致性及 Offer ID 投影，不建立第二套 wire schema。
- [x] 1.4 配置相對 /api、5173 → 可設定 API origin（本次 3201） 代理、server-side demo buyer 與深連結；實測 buyer scope 與重新整理。

## 2. Mock 組合與真實 Result API

- [x] 2.1 建立 MockResultProvider.generate(request_id, revision, documents, clock)，重用可信 seller／offer fixtures；列出支援的 intent／preference 樣本與 parser cases，不依賴模型 API。
- [x] 2.2 驗證 baseline 三策略、預算／交期／禁配件過濾、新 request 新 offer IDs、固定 clock／expiry、needs_clarification 與 no_match；不為湊三組放寬限制。
- [x] 2.3 實作 SQLite requests、offers、decisions 與 idempotency、唯一決策及原子交易；測試 rollback 與重啟保存原文件及價格。
- [x] 2.4 實作 POST /api/requests 回原始 202/formatting，背景執行 mock；GET 回權威快照且無副作用；驗證 late publication guard、processing_interrupted、未知欄位 400 與跨 buyer 404。
- [x] 2.5 實作 accept=200/accepted；驗證 scope、ranked eligibility、expiry 等號、可信 mock 庫存／價格／交期／items／條款；不保留庫存、不扣庫存、不兌換。
- [x] 2.6 實作所有 POST 冪等、原 response 重播、key conflict、request_in_progress；以併發／重啟／回應遺失測試證明 accept/reject 至多一個決策。

## 3. Reject 與 Buyer Agent handoff

- [x] 3.1 實作 reject 的 feedback 形狀／長度驗證及原文保存，200 回 action/request_id/status=rejected/feedback/source_documents；空白／超長 400，非空模糊文字也保存，不做模型語意澄清。
- [x] 3.2 在同一交易保存 rejected、完整決策與冪等結果；驗證 documents/revision 不變、selection/next_request_id 為 null、不改寫 intent、不建立 child。
- [x] 3.3 實作 GET.decision 恢復及同 key 重播；測試 response loss、reload、跨 buyer、相反決策競爭、外部交付失敗仍可重讀。
- [x] 3.4 提供 Buyer Agent handoff 使用範例與輸入輸出契約：呼叫端明確接收決策，未接入時只展示已保存；測試沒有模型／webhook／queue 自動呼叫，也不假稱改寫或下一輪完成。

## 4. React 滑卡與整合驗收

- [ ] 4.1 實作簡化圖卡、OfferDetails 的完整 item list／純文字理由、圖片佔位及 rank 順序；元件測試確認資料缺少時不杜撰優惠，長內容、空值與無效 payload 的呈現和禁用行為正確。
- [x] 4.2 實作左右滑／等價按鈕／撤回略過；測試 25% 門檻、pointercancel、垂直捲動不提交，右滑立即 accept 且無二次確認。
- [x] 4.3 實作 feedback 表單與全略過流程；測試非空/2000 Unicode code points、取消重看、400 保留草稿、200/rejected 顯示已保存 handoff，不自動切換 child。
- [x] 4.4 實作 reducer、sessionStorage pending journal、提交鎖與輪詢取消；測試雙擊、逾時、重載、相同 key 重試與舊 request 回應忽略。
- [x] 4.5 實作 Seller 狀態／最多五輪歷史與獨立 Sponsored 區塊、accepted／rejected 後的決策摘要；元件測試證明標記不改排名、不發起兌換或 Buyer Agent 自動改寫。
- [ ] 4.6 以實際 API＋SQLite 跑瀏覽器驗收：右滑採用、全左滑後明確拒絕、原始 handoff／GET 恢復、五家模擬紀錄、過期、鍵盤與手機版面；保存結果，不只測 mock。
- [ ] 4.7 在 Node 20 環境執行兩側 typecheck/test/build、npm run test:contracts 與 OpenAPI/OpenSpec 驗證；README 補上實際可用的啟動指令，包含第五、六批在內的所有任務完成後再 archive。

## 5. 視覺與動畫細化（已實作，部分專項驗收待完成）

本批依 design.md 第 8–11 節及 offer-swipe-ui requirements 執行。P1、P2、P4 是待決產品擴充，不視為本批已核准功能；原 P3 已定義為同工作區的 OfferDetails。

- [ ] 5.1 建立共用視覺 tokens 與 Surface、Button/IconButton、StatusPill/StatusMessage、ItemRow/PriceBlock、OfferMedia、FormField；用 computed styles 驗證色彩、圓角、字級、間距、命中區與對比，確認 result／feedback／negotiation／decision summary 重用相同變體。
- [ ] 5.2 實作 M1–M6 與獨立視覺狀態；驗證 8px 意圖門檻、雙向 25% release 門檻、阻尼、多點觸控、復位重抓、快速 skip/undo、capture 取消及鍵盤零動畫。不得讓 API dispatch 或 reducer 更新依賴動畫結束。
- [ ] 5.3 對動畫進度 0%／50%／100% 注入 accepted、失敗、逾時、expiry、request 切換及 reduced-motion 切換；驗證 pending journal、API 次數、焦點與無舊 callback 污染，並涵蓋 rejected 的保存與恢復。
- [ ] 5.4 保存 320／390／768／1440px、200% 文字放大、軟鍵盤、真實觸控、鍵盤及 reduced-motion 的視覺與操作驗收證據；量測表定動畫參數與穩定端點，未能執行的裝置檢查明列未確認，不能以 OpenSpec 通過代替 UI 驗收。

## 6. Chat 與同尺寸桌面工作區（已實作，部分專項驗收待完成）

- [ ] 6.1 實作共用 AppShell／WorkspaceHeader／AgentSidebar 與三段 responsive 規則；在 1536×1024 及既有 viewport 比較 Chat／offers／details 的 bounding boxes，靜止與轉場 0%／50%／100% 差距不超過 1 CSS pixel。
- [x] 6.2 實作 intent.md／preference.md 編輯器及 buyer-scoped sessionStorage 草稿／已儲存版本；驗證儲存失敗、取消、空 intent、20000 code points、跨 view／reload 恢復及本分頁保存提示。
- [x] 6.3 實作需求 composer、2000 code points 驗證、IME／Enter／Shift+Enter 與 deterministic RequestComposer；驗證未儲存設定不套用、合成後長度檢查，以及 POST body 僅符合既有 CreateRequest。
- [x] 6.4 實作 request-creation journal、送出鎖與原 key／body 重試；驗證雙擊、逾時、reload、202 後輪詢及 ready 前沒有可採用優惠入口，不以 mock 成功代表 API 串接成功。
- [x] 6.5 串接 查看優惠、返回對話、補充需求／reject handoff、新對話及 OfferDetails；驗證 skip／draft／focus／scroll 保留、drag 後不誤開明細、未知 POST 不因導覽解除，以及已結束輪次不被修改。
- [x] 6.6 實作桌面橫向簡化卡片與固定 action row，所有動作沿用同一 offer_id；驗證左右回饋方向、640px 卡的 160px commit 門檻、deck clipping、資訊不杜撰及明細全 items 不遺漏。
- [ ] 6.7 實作 M7 主區淡入、M6 即時明細及中斷／焦點行為；保存跨 view 動畫、鍵盤零動畫、reduced-motion 與晚到 response 的瀏覽器證據，確認外框／側欄／操作列不隨卡片移動。

## 後續整合（不屬於本次驗收任務）

Buyer Agent 的 intent 改寫、語意澄清、交付去重與 linked next request 的 parent／revision 契約由整合 owner 另案定義。完整 Seller／Evaluator、正式 OpenAI adapter、虛擬兌換、付款與庫存扣減均不作為本次 Result 服務完成條件。
