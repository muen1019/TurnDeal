# 手機真實 LLM 模式

外網分享請用另外的 `npm run demo:public`，見 [本機外網 Demo](PUBLIC_DEMO.md)。它提供 HTTPS 隧道＋打包前端，不直接公開本文件的 Vite LAN 開發服務。

根目錄執行 `npm run dev:mobile:secure`，PowerShell 隱藏讀取 key。後端 3203 僅綁定 loopback；Vite 5176 開放可信任區網，將 /api 代理到 3203。免費離線版 `npm run dev:mobile` 維持 5174 → 3202，不讀取任何 key。原本電腦 5173 → 3201 不改動。

安全原則依 [OpenAI API authentication](https://developers.openai.com/api/reference/overview)：API key 僅由伺服器環境載入，不放入客戶端。啟動器用分開的 frontendEnv/backendEnv，前端移除 KEY／TOKEN／SECRET／PASSWORD 等變數。實際金鑰不寫入檔案、SQLite 或終端輸出，結束恢復原環境。

5176 開放區網免配對使用，不需要配對碼、登入或各自的 API key。首次 API 請求會自動建立 HttpOnly SameSite=Strict 簽名匿名 cookie；後續請求帶同一 cookie 維持資料歸屬。同源寫入檢查與既有 buyer scope、idempotency 照常生效，不開放跨網站 CORS。直接呼叫 API 的工具也需要保留 cookie，無須提供 OpenAI key。

GET /api/mobile-session 是 dev-only 相容性／狀態端點，自動建立匿名 session 並回應 {connected:true, mode:"live", access:"open"}；舊版快取頁面也不會再要求配對。POST /api/mobile-session 已移除。離線版的 mode 為 offline。配對碼生成、配對猜碼限流及前端配對畫面均已刪除，沒有改成其他進入門檻。

每個瀏覽器的資料用獨立 buyer ID，SQLite 在記憶體，不讀原本 data/app.sqlite。重啟清空資料與簽名，重新整理後自動建立新 session。既有本分頁對話可以清除，但不得把 UI 歷史刪除誤認為正式訂單刪除。

資料流程：手機 → 匿名 session → Runtime → Formatter（OpenAI）→ Discovery（固定排序）→ Negotiation／Evaluator（既有 LLM 與安全備援）→ 測試結帳。Improver 同樣使用 live provider。畫面的模型選單只設定後續新需求；模型不可用、額度不足或 API 失敗會顯示備援，不能宣稱 LLM 成功。查 DB、排序、設定等操作不需要 LLM。

這是開發用 HTTP，不是正式 HTTPS 帳號／金流服務，僅是區網網址。所有能連到電腦的人都可使用同一後端 key 的 API 額度，開放使用風險由啟動者知悉承擔；沒有新增帳號、白名單或額外驗證。只在可信任 Wi-Fi 使用，請填虛構收件資料，勿直接公開部署；付款仍為模擬。

驗證：`node --test tests/mobile-demo.test.mjs` 檢查環境隔離、免配對存取、多瀏覽器資料隔離、同源、LLM transport 與冪等重播。Transport 測試注入假回應，不代表真實 OpenAI 帳戶呼叫成功；真實結果需啟動後新建需求確認「LLM 已解析」。

2026-09-12 本機實測：5176 回應 mode=live、access=open；全新 390×844 手機瀏覽器直接進入使用者設定，無配對輸入。透過一般 API 建立一筆缺少購買條件的測試需求，GPT-4.1 Mini 真實回應 provider=openai、status=needs_clarification、seller_agents=0，未啟動議價或購買。此結果只證明這筆 Formatter 呼叫成功，不代表其他模型或所有後續呼叫必定成功。
