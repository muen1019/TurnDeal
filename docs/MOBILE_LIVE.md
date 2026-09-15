# 手機真實 LLM 模式

根目錄執行 `npm run dev:mobile:secure`，PowerShell 隱藏讀取 key。後端 3203 僅綁定 loopback；Vite 5176 開放可信任區網，將 /api 代理到 3203。免費離線版 `npm run dev:mobile` 維持 5174 → 3202，不讀取任何 key。原本電腦 5173 → 3201 不改動。

安全原則依 [OpenAI API authentication](https://developers.openai.com/api/reference/overview)：API key 僅由伺服器環境載入，不放入客戶端。啟動器用分開的 frontendEnv/backendEnv，前端移除 KEY／TOKEN／SECRET／PASSWORD 等變數。實際金鑰不寫入檔案、SQLite 或終端輸出，結束恢復原環境。

5176 首次進入先配對：輸入電腦終端顯示的 12 碼隨機配對碼，不是 API key。dev-only GET／POST /api/mobile-session 查詢／建立 HttpOnly SameSite=Strict 的簽名 session。未配對不得存取 Runtime API；猜碼每分鐘最多 10 次。同源寫入檢查與既有 buyer scope、idempotency 照常生效。

每個瀏覽器的資料用独立 buyer ID，SQLite 在記憶體，不讀原本 data/app.sqlite。重啟清空資料、簽名與配對碼；重新整理後配對，再建立新需求。既有本分頁對話可以清除，但不得把 UI 歷史刪除誤認為正式訂單刪除。

資料流程：手機 → 配對檢查 → Runtime → Formatter（OpenAI）→ Discovery（固定排序）→ Negotiation／Evaluator（既有 LLM 與安全備援）→ 測試結帳。Improver 同樣使用 live provider。畫面的模型選單只設定後續新需求；模型不可用、額度不足或 API 失敗會顯示備援，不能宣稱 LLM 成功。

這是開發用 HTTP，不是正式 HTTPS 帳號／金流服務。只在可信任 Wi-Fi 使用，請填虛構收件資料；付款仍為模擬。API 費用由 key 擁有人承擔，配對碼不要公開分享。

驗證：`node --test tests/mobile-demo.test.mjs` 檢查環境隔離、配對、同源、限流、LLM transport 與冪等重播。Transport 測試注入假回應，不代表真實 OpenAI 帳戶呼叫成功；真實結果需啟動後新建需求確認「LLM 已解析」。
