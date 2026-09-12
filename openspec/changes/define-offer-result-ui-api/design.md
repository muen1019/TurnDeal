## Context

2026-09-12 問答擴充：整合 runtime 以 docs/CLARIFICATION_SPEC.md 為準。POST /api/requests 接受 optional clarification，建立保存原文的 parent-linked child；RequestSnapshot 增加 optional formatter 摘要，parent_request_id 可為 ID、revision 可遞增（1–9）。舊 mock 不支援補充，回 400；reject 後的 child 改寫仍未實作。以下「固定 parent=null、revision=1、不建立 child」只適用首次建立／legacy mock，不適用本擴充。

2026-09-12 手機改版覆蓋：767px 以下改依 docs/MOBILE_UI.md 與 buyer-chat-ui 的 Mobile-first purchase journey，採獨立進度頁、明示階段估算百分比、處理完成自動進入已驗證滑卡與小幅位移淡入。本文件舊有「不顯示百分比／不自動導航／零位移」僅保留於桌面；共享滑卡新增最大 9 度傾斜。資料契約、冪等與採用安全規則不變。

本 change 聚焦 Result 階段：使用者輸入 intent／preference，後端用 mock 產生優惠組合，前端用真實 API 提交 accept／reject，再將決策提供 Buyer Agent。Chat／卡片視覺保留，第 8–11 節只同步此生命週期。Result API 與前端串接已實作；驗證範圍與剩餘視覺工作見 tasks.md 及 docs/RESULT_TEST_REPORT.md。

## Goals / Non-Goals

**Goals:** 三個 HTTP 操作、deterministic mock、不可變 Offer、SQLite 真實保存與冪等，以及可恢復的 Buyer Agent handoff。

**Non-Goals:** Result backend 不執行 intent 改寫、完整 Formatter／Orchestrator／Seller／Evaluator 引擎、正式 OpenAI adapter、自動 child 編排、虛擬兌換、庫存扣減或真實付款。正式登入與跨裝置聊天保存亦不在本次範圍。

## Decisions

### 1. 工程與責任分工

frontend/ 使用 React、TypeScript、Vite，backend/ 使用 Express 5、TypeScript、SQLite；應用 Node engines 為 >=20.19.0 <21。前端原生 fetch 與 reducer，預設開發時 localhost:5173 的相對 /api 代理至 127.0.0.1:3201；可用 OFFERMESH_API_ORIGIN 覆寫 origin（例如 127.0.0.1:3001）以配合本機後端，這是 runtime 配置差異，不代表修改 backend 契約、OpenAPI 或此 change 的 API surface。部署保持同源，不開放任意 CORS。MVP 以本機固定 server-side demo buyer 為 scope，不接受 body buyer_id、不宣稱正式認證。

backend/src/app.ts 負責 requests 與 decisions；store.ts 保存 SQLite requests、offers、decisions、idempotency 並驗證決策；mockResultProvider.ts 是替換正式結果來源的邊界。不存在本次必須實作的 DocumentReviser 或 redemption route。

### 2. HTTP 與資料契約（v0.3）

以下是待實作契約，不是目前 v0.1 已支援的能力。reject 回應與狀態語意是 breaking change；必須先升版共用 Schema，於同一契約 PR 同步 OpenAPI、fixtures、驗證器、AGENTS.md／DEVELOPMENT_RULES.md 的受影響規則及所有消費端。backend/openapi.json 只引用新共用 Schema，不建立第二套私有 DTO；本次只修改 OpenSpec，不改既有契約檔。

| HTTP 操作 | 輸入 | 成功輸出 |
| --- | --- | --- |
| POST /api/requests | intent_md；preference_md 可省略且預設空字串 | 202 RequestSnapshot，status=formatting，revision=1，排程 mock generation |
| GET /api/requests/{request_id} | request_id | 200 RequestSnapshot，含結果及已保存的 decision |
| POST /api/requests/{request_id}/decisions | action=accept、offer_id，或 action=reject、feedback | 200 AcceptDecisionResult 或 RejectDecisionResult |

CreateRequest 保留原欄位，不接受 message、conversation_id、buyer_id、parent_request_id 或 revision。兩份文件各最多 20000 Unicode code points，intent trim 後不可空。feedback 原文最多 2000 code points、trim 後不可空；驗證後原樣保存。未知欄位、缺 key、JSON／長度錯誤一律 400 invalid_request。

AcceptDecisionResult 保留 action=accept、request_id、status=accepted、selected_offer_id、expires_at。RejectDecisionResult 定義如下，所有列出欄位必填且不接受其他欄位：

```json
{
  "action": "reject",
  "request_id": "req_001",
  "status": "rejected",
  "feedback": "不要滑鼠墊，預算改成 800 元，其他條件不變。",
  "source_documents": {
    "revision": 1,
    "intent_md": "辦公用無線滑鼠，預算 900 元含稅運，7 天內到货。",
    "preference_md": "價格優先，可接受免費滑鼠墊，不接受付費加購。"
  }
}
```

source_documents 是原始文件而非改寫結果。RejectDecisionResult 不包含 next_request_id 或新版 documents。Snapshot 保留原有 request/root/parent IDs、documents、intent、seller_agents、discovery_exclusions、sponsored_placement、offers、ranked_offers、confirmation_offer_ids、selected_offer_id、next_request_id、error，新增必填 decision（null | AcceptDecisionResult | RejectDecisionResult）及 Status 的 rejected。decision.request_id 必須等於 snapshot.request_id；accepted/rejected 時 decision 必須為對應型別且與 POST 已保存結果相同，其他本服務狀態為 null。rejected 時 selected_offer_id=null、error=null，source_documents 必須等於 documents。本服務不發布 superseded/redeemed，next_request_id 永遠 null；保留欄位不代表已支援 child。

前端以 ranked_offers.offer_id join offers，再以 seller_id join seller_agents。summary、available_actions 是本機衍生值，不加入 HTTP。商品圖／正式名稱未提供可信 Catalog 時用佔位與 使用者可理解的 category（product_id 僅留在資料層）；不捏造單價、折扣或免費贈品。Sponsored 獨立展示且不改 rank。

### 3. UI 狀態、手勢與恢復

UI reducer 使用 loading、browsing、feedback、submitting、reconciling、accepted、rejected、empty、blocked、error。右滑達卡寬 25%、水平大於垂直且 release 才立即 accept，無二次確認；左滑只更新本機 skipped IDs，可在未提交時撤回。所有方案略過只開回饋，不自動 reject。

每次 POST 前保存 key、exact body、request_id（已知時）到 sessionStorage journal。結果未知時保持決策鎖，以原 key/body 重試；GET 仍 awaiting_user 不代表 POST 失敗。GET 的 decision 可恢復已提交結果，但不能將別的分頁已保存的相反決策誤報為本次成功。request_in_progress 遵循 Retry-After；state_conflict 重新讀取權威狀態。建立需求逾時而未知 ID 時用原 POST 重試。

GET 不重疊，前一次結束後至少一秒再查；只輪詢 formatting（mock 準備中），切 request 使用 AbortController 及 ID guard。awaiting_user 有可採用合格方案才開 accept；no_match／needs_confirmation 可 reject；needs_clarification／failed 顯示原因，不提供可採用卡片。accepted／rejected 都停止輪詢與決策。rejected 顯示「回饋已保存」及可讀取的 handoff，不自動導航至下一輪；Buyer Agent 未接入時明示未接入。accepted 顯示採用摘要，不提供兌換按鈕或付款宣稱。

### 4. Mock 結果來源

MockResultProvider.generate(request_id, revision, documents, clock) 使用 contracts/fixtures 的 seller／happy-path 資料作可信示範來源，輸出可發布結果或 needs_clarification／no_match。初始格式驗證後進 formatting，再發布 awaiting_user；不為展示而假裝執行真實 Agent 階段。Seller 最多五輪資料可保留作明示模擬紀錄。

baseline 支援一隻無線滑鼠、最多一张選配滑鼠墊、含稅運整數 TWD 預算與最長交期；三策略為低價慢送、較高價快送、相關選配組合。實作以 fixtures 配套的文件樣本及 parser cases 明列支援語句（含預算／交期／禁用配件變體），依確認的限制過濾候選；未知、缺必要條件或互相矛盾的輸入回 needs_clarification，禁止回任意三張卡假稱符合。沒有配件政策只允許相關且不增加總額的選配；相關付費加購必須明示授權，未支援的政策要求澄清。過濾後可少於三組，零合格為 no_match，不能為湊卡片放寬需求。

Rank 使用 fixture 的固定策略且只包含全部 eligible、未過期候選，過濾後連續重編再一次發布；不是正式 Evaluator 執行。各 request 產生新 offer IDs，expiry 由發布 clock 計算並固定。GET 不重生價格、ID、rank 或 expiry。demo 標示由此服務部署／前端配置固定展示，不擅自增加未升版的 wire 欄位。

### 5. SQLite、交易與錯誤

requests 保存 buyer、ID、status、原始 documents／revision 與完整發布快照；offers 保存本輪不可變價格、items、交期、期限及 trusted fixture 參照；decisions 以 request_id 唯一，保存 action、feedback／selection 及完整 response。idempotency 以 buyer/method/path/key 唯一，保存 canonical payload hash、processing/completed、原 response status/body。不要實作本範圍用不到的 child、修訂草稿、兌換或庫存扣減資料表。

每個 POST key 為 1–128 字元。先驗證 JSON 與 ownership，再處理成功重播，然後才檢查可變狀態／期限。同 key 不同 canonical body 回 409 idempotency_conflict；處理中回 409 request_in_progress、Retry-After: 1；完成結果永久重播原 status/body（建立仍是原 202）。驗證失敗不占 key；確定未提交的錯誤釋放自己的 processing 記錄。

accept 短交易重驗 awaiting_user、scope、ranked eligibility、server time < expires_at、可信 mock 庫存及原價格／交期／items／條款，原子寫入 accepted、decision 與冪等結果；不保留或扣庫存。reject 短交易重驗 awaiting_user／no_match／needs_confirmation，原子寫入 rejected、原文 feedback、原 documents 與冪等結果；不呼叫模型。兩者競爭只能一方提交，另一方 409 state_conflict。

404 not_found 隱藏外部 buyer/request 資源；410 offer_expired 不改 selection；錯誤格式仍為 error.code/message/fields。未預期技術錯誤回 500 internal_error；目前不宣告未實作的 HTTP 503，未知 commit 結果由重試核對。reject 不做語意解讀，因此不回舊版 422 feedback_requires_clarification。

重啟保留已完成快照、決策與冪等資料，未完成 generation 標為 failed/processing_interrupted；只有確定無提交的 processing key 才可清理。generation 發布須核對 request_id／revision／formatting，晚到結果不覆蓋終態。

### 6. Buyer Agent handoff 邊界

Result backend 的交付終點是決策已保存並可回傳／重讀。reject 的 API payload 保留 source_documents 與 feedback；accept 回 selected_offer_id，呼叫端可用同一 snapshot 讀取完整方案及資料以供 validation、persistence 與 handoff。presentation 仍依第 10 節隱藏 source_documents 與技術欄位。採用選配不等於修改長期偏好，略過不構成拒絕理由。

呼叫端／整合 owner 必須明確消費 POST response 或 GET.decision，再交給 Buyer Agent。沒有 webhook、queue 或自動模型觸發；未接入時只顯示「回饋已保存，Buyer Agent 尚未接入」。外部 handoff 失敗不撤銷 rejected，可重讀後重試交付；整合 owner 依 request_id 與已保存決策去重，不能用 HTTP 冪等宣稱 Agent exactly-once。

Buyer Agent 的語意澄清、改寫、後續提交與 parent/revision 關聯另列整合契約，本 change 不實作。使用者仍可明確「新對話」建立獨立 root，但不能冒充舊輪 child。任何元件都不能宣稱已改寫本地 intent.md 檔案。

### 7. 待實作驗收

先驗證升版 Schema／OpenAPI／fixtures，再於 Node 20 實跑 typecheck、test、build。mock 測試覆蓋 baseline 三策略、預算／交期／配件過濾、未知輸入澄清與 no_match；API＋SQLite 測試覆蓋跨 buyer、expiry 等號、同 key 重播／衝突、accept/reject race、rollback、重啟與 late publication。使用可控制 clock，不能只靠瀏覽器本地 mock 證明真實決策 API。

前端驗收保留滑卡、Chat、明細及動畫，改驗 reject=200/rejected、原始 handoff 顯示與 GET 決策恢復。驗證沒有 child 自動建立、模型改寫或兌換呼叫；Buyer Agent 未接入的 UI 不假稱後續成功。

### 8. 參考圖的視覺系統（待實作）

本節與 [UI requirements](specs/offer-swipe-ui/spec.md)、[Chat requirements](specs/buyer-chat-ui/spec.md) 細化待實作設計，不表示已有 UI。使用者已確認 AI Chat 與簡化滑卡設計，並要求兩者介面尺寸一致；以藍白桌面 workspace 為最新版視覺依據，保留暖色外底、炭黑主操作與柔和圓角。第 10 節定義共同尺寸，第 11 節定義 Chat。概念圖收於 [視覺參考](assets/README.md)，不是像素驗收或可信商品資料；精確值以本文件及 requirements 為準。此前手機參考圖及 README GIF 僅保留為互動靈感，不再決定桌面畫布尺寸。

#### 視覺 tokens

| Token | 目標值 | 用途 |
| --- | --- | --- |
| color.canvas | #E8F1F8 | 全螢幕頁面與 body 背景；不得露出外層暖色邊框 |
| color.shell | #E8F1F8 | Chat／滑卡共用 AppShell 與側欄 |
| color.surface | #FFFFFF | 圖卡、內容列、表單 |
| color.surface-subtle | #F5F8FC | Chat、結果區及收據區背景 |
| color.accent-surface | #DFECEF | 次要按鈕、圖示底、資訊標籤 |
| color.ink | #252A28 | 主文、圖示、主按鈕底 |
| color.muted | #566361 | 次要說明；不可用淡灰代替以致難讀 |
| color.focus | #315E68 | 焦點環、需辨識的輸入框邊界 |
| color.success / color.danger | #286344 / #9F3434 | 成功／錯誤文字與圖示，仍搭配文字標籤 |
| color.decorative-peach | #E7B293 | 中性圖片佔位的裝飾；不承載狀態或文字 |
| radius.panel / card / media | 32px / 24px / 20px | 主面板、方案卡、內嵌圖片；外圓角大於內圓角 |
| radius.control / item / pill | 16px / 16px / 999px | 按鈕與輸入框、商品列、狀態標籤 |
| shadow.raised | 0 8px 24px rgba(37, 42, 40, 0.08) | 活躍卡片或浮起的操作列，最多一層陰影 |
| space | 4 / 8 / 12 / 16 / 24 / 32px | 共用間距尺；卡片內距 24px，小螢幕 16px |
| type | system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif | 系統字體，中文使用系統 fallback |
| type.body / secondary / heading / price | 14/22.4px、13/20px、22/30.8px、32/36.8px | 字級／行高；主文 400，標題／按鈕 600，價格 700。手機頁面標題 20/28px、價格 26/29.9px；商品標題桌面 18px／手機 17px；手機編輯欄維持 16px。縮小字級不縮小至少 44×44px 的操作命中區。 |

主按鈕使用 surface 文字／ink 底，次按鈕使用 ink 文字／accent-surface 底。一般文字對比至少 4.5:1，可操作圖示、必要邊界與焦點環相對相鄰底色至少 3:1。停用按鈕保留可讀文字，以 disabled 語意及「提交中／已到期」說明狀態，不以整個卡片降低 opacity 來表達停用。

#### 版面與 component 重用

| 共用 component | 契約與使用位置 |
| --- | --- |
| AppShell / WorkspaceHeader / AgentSidebar | Chat、滑卡、明細及終態視圖共用外框、頂列、側欄與主區插槽；切 view 不重新掛載 AppShell |
| Surface | panel、card、item 三種 radius 變體；OfferCard、FeedbackForm、NegotiationPanel、DecisionSummary 共用色彩與留白 |
| Button / IconButton | primary、secondary、quiet 變體共用 16px 圓角、48px 高度、最小 44×44px 命中區與焦點／pending／disabled 行為；圖示視覺尺寸 20px |
| StatusPill / StatusMessage | 標籤共用色彩語意；pending、expired、accepted、rejected 由文字區分；Sponsored 使用中性資訊樣式，不借用成功標籤 |
| ItemRow / PriceBlock | 48×48px 縮圖或佔位、商品名稱及唯讀數量；總額獨立強調並附「含稅運」；方案與決策摘要共用排版，不共用可變資料 |
| OfferMedia | 4:3 固定比例、20px 圓角；可信素材 contain、不裁切商品；無素材時中性佔位及「商品示意」文字，不能暗示品牌／實際外觀 |
| FormField / InlineMessage | 回饋欄位、說明與錯誤共用字級／焦點／錯誤樣式，不另做彈窗驗證 |

單頁不是三支手機 mockup 並排；Chat、滑卡與明細使用第 10 節的共同 AppShell 尺寸與 responsive 規則。簡化主卡保留商品圖、seller、組合名稱、主要優惠（有可信資料時）、含稅運總價、交期、精簡期限及「查看 N 件商品明細」。完整 items、條款、理由與 tradeoffs 移至同尺寸主區的 OfferDetails，不在簡化卡片上重複所有明細。不得因移入明細而刪除必填資訊或改變後端數值。

body 與頁面根節點不得產生 x/y 文件捲動；AppShell 以 #E8F1F8 全螢幕鋪滿 viewport。長 Chat、editor、items、reasons、terms 與 history 只在各自內容區內部捲動，底部操作列在該區域內保持可達並預留 safe-area inset。不得複製參考圖的狀態列、home indicator、購物車導航、收藏或數量增減控制。頁面首次就顯示「右滑或按採用會立即採用此方案」，不依賴使用者看過動畫教學。

### 9. 動畫與中斷模型（待實作）

#### 狀態責任

業務 reducer 沿用第 3 節；視覺狀態另外標記 resting、dragging、returning、leaving，不寫入 API。pointer release 的有效事件先同步鎖定決策及保存 pending journal，再立即發出 POST；不得等待 transitionend、spring rest 或動畫 promise。動畫只呈現已確定的本機略過或服務端結果。accepted 與 rejected 為本次不同的決策終態，不包含兌換。

| 觸發 | 業務轉換 | 視覺處理 |
| --- | --- | --- |
| 卡片水平拖曳 | browsing 不變 | resting → dragging；放開前不提交 |
| 未達門檻、反向回到門檻內、取消 | browsing 不變 | dragging → returning → resting |
| 有效左滑／略過按鈕 | 立即更新本機 skip，browsing 或 feedback | 舊卡 leaving，新卡補位或顯示回饋 |
| 有效右滑／採用按鈕 | browsing → submitting | 原卡回中心，保留內容，立即顯示「採用中」；不展示可操作下一張 |
| accept 成功／已核對 accepted | submitting 或 reconciling → accepted | 同一方案切為已採用，展示已保存決策摘要 |
| POST 結果未知 | submitting → reconciling | 保留原卡與提交鎖，顯示「確認結果中」 |
| 無副作用且可修正的錯誤 | submitting → 原可操作狀態 | 原卡／回饋草稿保留，顯示 inline error；410／409 依服務端生命週期處理 |
| 明示 reject 得到 200 | submitting → rejected | 顯示回饋已保存；source_documents／原始文件僅保留於 API contract、persistence 與 handoff，不出現在 presentation；等待外部 Buyer Agent 整合；不生成新輪 |

#### 動畫參數表

所有延遲為 0ms。`motion.ease-out = cubic-bezier(0.23, 1, 0.32, 1)`。一般狀態變化只動畫 transform、opacity；不使用全屬性 transition、blur、shadow 動畫、輪詢閃爍、逐卡 stagger 或持續裝飾動畫。gesture settle 是唯一 300ms 以上例外，用連續速度避免中斷跳動。實作優先 CSS transition 處理按鈕與淡入；手勢可用支援中斷與速度保留的 spring 引擎，集中封裝在 OfferDeck，不讓各卡片自行定義參數。

| ID | 觸發／起點 → 終點 | 一般模式參數 | 中斷規則 | reduced-motion |
| --- | --- | --- | --- | --- |
| M1 press | 可操作按鈕 pointerdown scale 1 → .97；release/cancel → 1 | 各 160ms ease-out；不縮放卡片本身 | 由當前 transform 轉向新目標；disabled/pending 立即回 1 | 無 transform，0ms 切換按壓底色 |
| M2 drag | 已取得水平手勢的卡片 translateX(0) → 當前 dx | 直接跟隨 pointer，0ms、無 easing／旋轉；超過一張卡寬的位移以 0.25 倍增量阻尼 | 捕捉 pointer；後續新 pointer 不接管；原 pointer 取消則 M3 | 卡片固定；同一門檻以靜態「放開以採用／略過」文字提示 |
| M3 return | 未提交拖曳或採用提交中的當前 x → 0 | spring duration 0.5 秒、bounce 0.2；透明度 1 | 可操作時重抓保留當前位置／速度；pending 時僅可中止視覺、不能新決策 | 立即復位，0ms |
| M4 skip / undo | 略過舊卡從當前 x → -1.2W、opacity 當前值 → 0；新卡 translateY(8px)/scale(.97)/opacity(0) → 0/1/1 | 200ms ease-out，同步開始；undo 由當前呈現值恢復上一張至中心／opacity 1，200ms | 新操作先確定上次邏輯結果；undo 對同一 offer 重定向，連續 skip 最多保留一張 leaving layer，不排動畫佇列 | 無位移／縮放；新內容 opacity 0 → 1，160ms ease-out；舊內容立即移除 |
| M5 state | 初次結果、accepted、rejected、全略過回饋、inline error 的新內容 opacity 0 → 1 | 160ms ease-out，容器高度由正常排版決定；不把整張資訊卡淡出重入 | 更新到最新業務狀態，取消過時動畫；相同資料輪詢不重播 | 僅同樣 160ms opacity；不得延遲訊息或操作語意 |
| M6 details | 使用者開啟／返回 OfferDetails，或展開／收合明細內的理由、tradeoffs 或歷史 | 0ms，替換主區或直接排版；AppShell 不動 | 重複切換只取最新 view／展開狀態；內文可選取／捲動 | 同一般模式，0ms |

W 是 pointerdown 時的卡片寬度；提交判定使用原始水平位移而非阻尼後像素。M4 的按鈕略過也使用相同左移；undo 的上一張從保留的當前位置恢復，已卸載時從 -1.2W／opacity 0 恢復。leaving layer 僅作視覺、不可聚焦、不可操作、對輔助科技隱藏。

鍵盤啟動的操作一律 0ms，包含後續該操作的非同步成功／錯誤回饋；loading 初次結果若沒有鍵盤操作來源則按 M5。混合使用時以觸發這次動作的輸入來源決定，不用一次鍵盤事件永久切換所有動畫。hover 僅在 `(hover: hover) and (pointer: fine)` 提供即時底色差異；焦點環即時顯示 2px focus 色、2px offset，不動畫。進行中的狀態用靜態圖示及文字，不使用無限旋轉或 shimmer。

#### 手勢、中斷與驗收方式

- 水平意圖成立條件為 abs(dx) ≥ 8px 且 abs(dx) > abs(dy)；只從非互動卡片區啟動。按鈕、連結、輸入欄位、可選取的展開內文不啟動拖曳。保留垂直原生捲動；瀏覽器接手捲動時依 pointercancel 復位。
- 左／右滑都在 release 時使用 abs(dx) ≥ 0.25W 且 abs(dx) > abs(dy) 判定，方向取最終 dx。速度不能替代位移；跨過右門檻後拖回門檻內不採用。一般與 reduced-motion 模式均在門檻成立時即時顯示「放開以採用／略過」，回到門檻內立即清除提示。除原 active pointer 外的觸碰不改位移或發送決策。
- Escape、pointercancel、意外失去 pointer capture、視窗失焦、隱藏分頁、方向／卡寬改變，均取消尚未提交手勢；Escape、視窗失焦／隱藏與 resize 直接復位，其他使用 M3。這些事件不得撤銷已提交的 POST。正常 pointerup 的 capture 釋放不再次取消已處理的 release。
- 復位中重新開始拖曳，由當前畫面位置接續；該次 commit 仍只計新 pointerdown 之後的實際位移，不能靠殘留 transform 達門檻。略過離場中再按 undo，立即恢復同一 offer，不復活第二份卡片。
- 提交鎖建立在事件處理開始時。過期、權威 accepted／rejected 或 request 切換優先於 dragging／leaving；清除手勢及失效動畫 callback。晚到的 animationend 不能發 POST、移動索引、解鎖或更新舊 request。
- `prefers-reduced-motion` 初始即讀取且動態監聽；切為 reduce 時停止所有 transform 動畫、把卡片固定於中心，保持 active pointer 的原始位移追蹤及業務狀態。切回 no-preference 不重播已完成轉場；下一次新操作才啟用空間動畫。
- 邏輯與網路驗收用可控制 clock／回應的瀏覽器場景：動畫進度 0%、50%、100% 都插入新操作與伺服器回應。樣式驗收讀 computed styles；duration／curve／spring 設定須等於表值，端點穩定後座標允差 1px、opacity 允差 .01；timer 容差一個渲染 frame，不把低效能裝置的掉幀誤判成設定差異。
- 後續實作驗收另在觸控裝置及 320、390、768、1440px viewport 檢查捲動、文字放大 200%、焦點及 reduced-motion；目前只交付規格，沒有宣稱視覺或效能測試通過。

### 10. Chat 與滑卡共用的全螢幕工作區（待實作）

「同尺寸」指同一 viewport 下 AppShell、WorkspaceHeader、AgentSidebar 與主內容插槽的 bounding box 相同，不要求優惠卡填滿整個 Chat，也不把桌面縮成 390px 手機畫布。AppShell 保持掛載，只切換主區的 chat、offers、details、feedback 或 result 視圖。

| Viewport 寬度 | 共用外框 | 導覽與主內容 |
| --- | --- | --- |
| ≥1200px | width=100vw；height=visualViewport.height when available, otherwise 100dvh；margin/border/radius=0；background #E8F1F8 | 頂列 64px；左側欄 240px；主區內距 24px。Chat 為彈性對話區＋16px gap＋360px 編輯器。滑卡收起編輯器，主區使用這兩欄原本的完整寬度。 |
| 768–1199px | width=100vw；height=visualViewport.height when available, otherwise 100dvh；margin/border/radius=0；background #E8F1F8 | 頂列 64px；側欄收為 72px 導覽列，圖示仍有可及名稱；編輯器透過「代理設定」替換主內容，不擠壓 Chat。 |
| 320–767px | width=100vw；height=visualViewport.height when available, otherwise 100dvh；margin/border/radius=0；background #E8F1F8 | 頂列 56px；不保留固定側欄，改成頁面內可展開導覽，零動畫；Chat／編輯器／滑卡／明細一次一個主視圖。 |

body、html、root 與 AppShell 不得產生頁面層級水平或垂直捲動，也不得使用舊版 min-height:720px 或文件流 fallback 撐開外頁。正常與窄高 viewport 下，只有主內容內的 Chat thread、definition editor、OfferDeck、OfferDetails、feedback、accepted/rejected result 與 negotiation history 可各自捲動；頂列、側欄與當前視圖的主要操作保持可達。軟鍵盤、200% 文字放大或超長內容不得把送出、儲存、採用、略過、返回與回饋操作推出不可達區域。

桌面 OfferDeck 佔滿主區，卡片置中；≥1200px 的卡寬為 min(640px, deck 可用寬−96px)，內部商品圖與資訊兩欄、gap 24px；較小 viewport 改單欄、最大 480px，保留 16px 安全間距。圖片沿用 4:3，卡片高度由內容決定，但卡片所在主區內部捲動，不造成 body 捲動。卡片下方操作列固定在自己的版面位置，不跟隨 translateX；桌面不是放大手機 mockup。rank／N 計數沿用後端原始 rank 與總方案數，略過不重編排名；全部略過時另顯示回饋。

使用者可見 UI 不顯示 technical/debug data：不得顯示 request_id、offer_id、product_id、terms_id、campaign_id、raw JSON、decision payload 或 source_documents 內容。API v0.3 仍保留 source_documents 與 decision 等 contract 欄位供 validation、persistence、handoff 與 reconciliation 使用；本節只要求 presentation 隱藏。可見內容應保留使用者需要的 seller、round、total price、delivery、expiry、items with quantity、自然語言條款、推薦理由、tradeoffs、saved feedback summary、Sponsored 標籤，以及使用者明確要求的 intent.md／preference.md 編輯器。

M7 workspace transition：點「查看優惠」、返回 Chat 或開／關 editor 時，新主區 opacity 0→1，160ms ease-out、delay 0；離開內容立即不再互動，外框不動畫、不縮放、不改尺寸。重複導覽以最新 view 為準並取消舊動畫；鍵盤導覽 0ms，reduced-motion 只保留 160ms opacity。details 採高頻 M6 的 0ms。背景網路工作由 request scope 管理，切畫面不取消已送出的決策或清除 pending journal。

### 11. AI Chat 與 Buyer Agent 定義（待實作）

新增 [buyer-chat-ui](specs/buyer-chat-ui/spec.md)。Chat 是 Buyer Agent 的購物入口，不擴展成任意工具或檔案存取介面。左欄提供對話、代理設定與本分頁最近需求；中央為訊息及需求輸入；右欄在桌面編輯 intent.md 與 preference.md，對應共用 CreateRequest 的 intent_md、preference_md。不存在的其他檔案不顯示為可編輯文件；概念圖的「其他定義」實作為 preference.md。

MVP DefinitionDraftRepository 採 buyer scope 的 sessionStorage，保存兩份草稿、兩份已儲存文字及本機設定版本。顯示「已儲存於此分頁／儲存後套用於下一次需求」，不宣稱已写入 repo、伺服器檔案或跨裝置同步。儲存成功才替換已儲存版本；失敗保留 dirty 草稿及錯誤；取消變更只恢復已儲存內容，不改既有 RequestSnapshot。代理設定為選填；初始兩份草稿與已儲存文字皆為空，可只儲存 preference.md，也可清空先前模板後儲存。保留既有分頁資料，不自動覆寫。

對話及編輯器草稿在同分頁切 view／重載時恢復。敏感內容不拼進 URL；清除儲存或更換分頁時提示本地內容不可恢復，可仍以 request_id 讀後端快照，不捏造聊天歷史。編輯器 clean → dirty → saving → clean／save_error；saving 時禁止送出新需求，避免拿到半套設定；可編輯未完成文字但保存版本與新輸入分開。

Chat 狀態為 empty／draft／sending／processing／ready／failed。需求限制 1–2000 Unicode code points（trim 後不可空）；Enter 送出、Shift+Enter 換行，IME composing 的 Enter 不送出。尚未儲存的設定不自動套用；送出處明示設定選填與已儲存設定會套用，若有未儲存變更則另行提示。沒有已儲存 intent 也能直接送出有效需求；送出中與未知提交的鎖定規則保持不變。

新對話第一次需求使用 deterministic RequestComposer：若已儲存 intent 非空白，intent_md 為已儲存 intent 文字、兩個換行、`## 本次購買需求`、換行、trim 後需求；若沒有模板或模板僅有空白，intent_md 直接為 trim 後需求，不加標題。preference_md 原樣取已儲存內容，預設空字串。不得在 UI 用模型擅自改預算或加入授權。組合後 intent_md 及 preference_md 各依共用契約檢查最多 20000 Unicode code points，intent_md 仍不可空白，再呼叫既有 POST /api/requests；不送出額外 message、filename、definition_version 或 conversation_id 欄位。本機設定版本及送出時文字快照只記在本分頁，以利追溯。

發送前保存 request-creation journal（key＋exact body＋本機對話識別），sending 期間防止重複 Enter／click。202 回來記住 request_id，依既有 GET 輪詢顯示真實階段；逾時以同 key／body 重試，不因返回 Chat 或重新整理而產生新工作。未配置 AI adapter 時以明示 demo 的 deterministic 狀態訊息呈現，不假稱模型對話或議價已完成。

awaiting_user 後提供「查看 N 組優惠」，不自動導航、不自動採用。`/requests/{request_id}` 顯示 offers；返回 `/chat?request_id={request_id}` 恢復該次對話及 draft，直達 request 若無聊天歷史則只顯示可驗證的需求快照與「本分頁沒有原對話紀錄」。active awaiting_user 的「補充需求」沿用明示 feedback，送出按鈕顯示「送出回饋」，呼叫 reject API 保存回饋；API v0.3 可回傳 source_documents 供 validation、persistence 與 handoff，但 UI 只顯示回饋已保存摘要，不顯示原始文件或 source_documents 內容；200 後顯示 rejected，不自動建立 child 或宣稱 intent 已改寫。後續 Buyer Agent 整合未接入時明示。processing 或未知 POST 結果期間可以打草稿，但禁止會造成另一輪決策的送出；已結束的輪次要透過「新對話」開始新需求。

設定保存、新 chat request、reject 或 accept 各有獨立本機狀態，不把修改文件當成採用，也不把返回 Chat 當成拒絕。附件、語音、跨裝置同步及帳號設定服務不在本次範圍；概念圖中如有相應裝飾 icon，實作不建立無作用按鈕。

## Product decisions pending

下列為新增產品行為／素材來源的待決事項，不阻塞上述規格，也不是已核准的開發任務。未決前沿用表列現有行為。

| ID | 需要決定的事項 | 未決前行為與影響 |
| --- | --- | --- |
| P1 | 是否提供可信商品圖片／名稱，以及由哪個 Catalog 提供？ | 用中性佔位與既有 使用者可理解的 category（product_id 僅留在資料層）；不抓取參考圖商品照片、不新增 wire 欄位。核准真實素材後需另定資料來源與失敗回退。 |
| P2 | 是否要參考圖的收藏、分類篩選、購物車或數量編輯？ | 本次不加入。若要加入，須另定篩選與排名關係、收藏保存位置，以及修改數量如何形成新需求；不能直接修改不可變 offer。 |
| P4 | Buyer Agent 定義與聊天記錄是否需要跨分頁／跨裝置保存？ | MVP 明示保存在本分頁，既有已發布請求仍由 backend 保存。若需帳號級持久化，另定權限、版本衝突與 API，不假稱本次三個 HTTP 操作 已支援。 |

已決：Chat 與滑卡使用同尺寸 AppShell、可編輯 Buyer Agent 定義、簡化卡片與點入 item list；原 P3 以同工作區明細視圖落定。右滑立即採用、沒有二次確認、accepted 僅顯示決策摘要，虛擬兌換移出本次範圍。這些不列為待決問題。

## Risks / Trade-offs

- 契約升版尚未完成：本文件是目標行為，舊 v0.1／OpenAPI 不能直接驗收新 reject；先交付契約 PR。
- Mock 不理解任意自然語言：公開支援樣本與限制，未知條件要求澄清，不擅自放寬。
- Buyer Agent 尚未接入：保存與恢復 handoff 不代表已交付或已改寫，UI 分別說明。
- 立即採用可能誤觸：維持既定手勢門檻、等價按鈕、提交鎖與無二次確認。

## Migration Plan

先升版共享契約及 owner 文件，再依 tasks.md 建立 MockResultProvider、API／SQLite，最後串接前端。此規格變更不代表功能已交付，不 archive，也不宣稱舊 fixture 已驗證新契約。保留既有資料與已發布 ID；實作時不得用刪庫掩蓋決策或相容性問題。

## v0.3 契約與資料庫統一

使用唯一 a2a-commerce.v0.3.schema.json；old contracts 歸檔至 contracts/archive。Mock 使用 main Catalog，A/B/C 五輪、D 三輪、E 一輪，所有歷史 Offer 可查詢但僅 final IDs 可採用。Backend 使用 db/migrations 的正規化表格，003 保存 Result state 與原始決策，保留 frozen snapshot 與舊資料備份。
