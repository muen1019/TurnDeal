# 本機開外網 Demo（不部署 Heroku）

1. 終端 A：`npm run dev:mobile:secure`，隱藏輸入新的 OpenAI key。已啟動就不用重開。
2. 終端 B：`npm run demo:public`。
3. 分享輸出的 `https://隨機名稱.trycloudflare.com/chat`，手機行動網路可用、不需配對碼。
4. Demo 結束在終端 B 按 Ctrl+C 關閉公開隧道；終端 A 可繼續本機使用。

電腦需保持開機、連網且不能休眠。隧道重啟網址會改變；不是永久部署，也沒有可用性保證。

## 初次安裝

Windows x64：從 [Cloudflare 官方 releases](https://github.com/cloudflare/cloudflared/releases) 下載 `cloudflared-windows-amd64.exe`，核對該 release 的 SHA256，放到根目錄 `.local-tools/cloudflared.exe`。該目錄不進 Git。啟動器不自動下載或安裝系統服務。

## 架構與限制

外網 HTTPS → Cloudflare Quick Tunnel → 本機 127.0.0.1:5180（打包前端＋受限 API 代理）→ 現有 127.0.0.1:3203 live 後端。

- 不暴露 Vite、原始碼目錄、SQLite、商家 webhook 或任意本機 port。只允許本次產生的 hostname。
- 保留同源寫入、匿名 cookie、買家資料隔離，公開 cookie 加上 Secure。key 只在原後端，build 與 tunnel 子程序會去除敏感環境變數。
- 不需要 Heroku、網域、配對码或使用者各自提供 key。訪客都消耗啟動者的 API 額度。
- 每次啟動最多 120 筆寫入、每分鐘最多 30 筆（所有訪客合計，含設定與結帳）；超出回應 429。這不是精確金額上限：一筆購物需求可能產生多個模型呼叫，既有背景作業不會因關閉隧道而停止。
- 資料仍存在目前手機 Demo 記憶體 SQLite。只重啟隧道不清除後端資料；後端重啟會清除。不同網址的瀏覽器 cookie／本地歷史互不共用。
- 收件資料只填虛構內容，付款仍為模擬。網站流量會經 Cloudflare 處理，但 OpenAI key 不會被送給 tunnel。
- 前端改動需重啟 `demo:public` 重新打包，沒有開發熱更新。

驗證：`npm run test:public`。真實 LLM 仍須以新需求回傳 `formatter.provider=openai` 確認，不可把 mode=live 當成每一筆呼叫都成功。

[Cloudflare Quick Tunnels 官方說明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
