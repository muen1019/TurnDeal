## Why

本次工作聚焦 Result owner：收到使用者 intent 後回傳可展示的 mock 優惠組合，並提供真正保存 accept／reject 的後端 API，將決策交給 Buyer Agent。搜尋、議價、評估先以 deterministic fixtures 代替；Result backend 不負責改寫 intent。

## What Changes

- 在 backend/ 定義 Node.js 20.19+ 的 20.x、TypeScript、Express 5 與 SQLite 的 Result 服務；所有應用功能尚未實作。
- 定義三個 HTTP 操作：POST /api/requests、GET /api/requests/{request_id}、POST /api/requests/{request_id}/decisions。
- 建立需求後，以固定測資產生可重現、符合支援條件的數組 Offer；圖片只作視覺參考，不是商品或價格資料來源。
- 真實保存需求文件、不可變方案、決策及冪等結果；右滑立即採用，左滑只在本機略過。
- **BREAKING** reject 成功由「202、superseded、修訂文件及 next_request_id」改為「200、rejected、原始 feedback 與 source_documents」。不在 reject 交易中改寫文件或建立 child。
- **BREAKING** RequestSnapshot 新增終態 rejected 與可恢復的 decision 欄位；原有 offers、ranked_offers、seller_agents 等資料仍以 ID 投影到 UI。
- Buyer Agent／呼叫端整合者接收決策後，負責澄清、改寫與後續需求；HTTP 回傳不代表 Agent 已被觸發。
- 虛擬兌換、付款、庫存扣減、完整議價引擎、正式 OpenAI adapter 與自動建立下一輪移出本次交付。
- 保留 Chat、同尺寸 AppShell、卡片、明細與動畫設計，只同步必要的決策／回饋生命週期。

## Capabilities

### New Capabilities

- `result-api`: intent 輸入、mock 結果、真實 accept／reject、持久化、冪等及結果恢复。
- `feedback-loop`: 將原始文件與明示回饋交給 Buyer Agent 的 handoff 契約；不在 Result backend 改寫。
- `offer-swipe-ui`: 排名圖卡、立即採用、本機略過、回饋已保存終態及提交核對。
- `buyer-chat-ui`: 需求輸入、定義編輯、Chat／結果導覽及決策 handoff 呈現。

### Modified Capabilities

無既有已封存 capability；本 change 仍為待實作規格，不 archive。

## Impact

本次只修改 openspec/changes/define-offer-result-ui-api/。現有 contracts/a2a-commerce.v0.1.schema.json、backend/openapi.json、fixtures、AGENTS.md 及 docs/DEVELOPMENT_RULES.md 仍記錄舊版產品契約，不能宣稱已同步或直接用於新的 reject 消費端。

依契約變更流程，實作前須將共用契約升版，於同一個契約變更 PR 同步 Schema、OpenAPI、fixtures、驗證器及受影響的 owner 文件，明確區分完整產品的兌換流程與本次 Result 子範圍。本 change 是上述變更的規格依據；不就地修改 v0.1 的既有語意。
