# 手機優先 UI v1

新版首頁採冷藍色系。第一次先走「基本資料 → 四項偏好權重／顏色 → 購物首頁」，設定可從齒輪修改；進階 Markdown 設定另有入口。整合版保存 SQLite，固定預覽只保留本頁記憶體；付款僅方式偏好，不收卡號。見 [BUYER_SETUP.md](BUYER_SETUP.md)。

手機（767px 以下）：直接輸入 → 必要時補充問答 → 獨立處理頁 → 完成後自動切入滑卡結果。桌面也採精簡輸入首頁，後續處理保留工作區。

首頁移除標題、行銷介紹與商品示範區，只保留輸入、開始按鈕與簡短模式／安全標示。問答包含偏好快捷選項、自訂答案與重新整理後恢復；細節見 [CLARIFICATION_SPEC.md](CLARIFICATION_SPEC.md)。實際 LLM 測試請開 http://127.0.0.1:5173/chat，5174 僅是無 API key 的固定測資預覽。

- 暖白、深墨綠、薄荷綠的 iOS 風格網頁；不是原生 iOS App。
- 四階段進度採後端已觀測狀態：送出 3%、整理 12%、搜尋 30%、議價 60%、評估 88%，只有 awaiting_user 才 100%。清楚標示「依處理階段估算」，不是精確工作量或剩餘時間；沒有假計時器自動推進。
- 只在本次提交／處理中追蹤的手機頁面，自動進入已驗證且有未過期優惠的結果。歷史結果返回 Chat 不強制跳頁。
- 失敗、待澄清、未知提交不顯示成功或解鎖決策。保留冪等提交與錯誤重試。
- 滑卡沿用既有手勢門檻、垂直捲動判斷、pointer capture、撤回與重複採用鎖。左滑只略過；右滑模擬採用，沒有付款。按鈕提供等價操作。
- 動畫只用 opacity／transform；尊重 prefers-reduced-motion。safe-area 與 visualViewport 處理瀏海、底部區域與軟鍵盤；小螢幕內容可在主區域捲動，不裁切操作。

## 手機預覽

執行 `npm run dev:mobile`，手機和電腦連同一個可信任 Wi-Fi，開啟終端輸出的 `http://區網IP:5174/chat`。

這是 **fixture 互動預覽**，不是 LLM／SQLite live 服務；使用固定示範商品，不解讀任意商品類別。此 Vite 程序不繼承 key、不 proxy 到 3201，不消耗 OpenAI 用量。5173 原本的 live 應用仍只供電腦 localhost 使用。不要把 Vite 開發伺服器轉發到公開網路。

若手機打不開，先確認相同 Wi-Fi／非訪客隔離網路，再檢查 Windows 私人網路防火牆。不要關閉整個防火牆。此版本未建立防火牆規則；不要宣稱已驗證實體手機連線。

UI 預覽不採用本機 live 的既有購買決策；手機 preview 的暫存資料與 live 資料庫分離。結束展示停止 `dev:mobile` 即關閉區網入口。

## 驗證

`npm --prefix frontend test`、`npm --prefix frontend run build`。
啟動 mobile preview 後執行 `node tests/mobile-browser.mjs`，涵蓋 320／390／430px、桌面、階段進度與自動切頁、略過／撤回、模擬採用、reduced motion，以及無頁面水平溢出。
