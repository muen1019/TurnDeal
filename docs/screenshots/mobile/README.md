# TurnDeal 手機操作截圖

390 × 844 手機視窗，實際 React UI 與手機 Demo API；全部使用虛構收件資訊。付款為模擬，不扣款、不出貨。設定與結帳較長，各拆成兩張截圖。

| 畫面 | 截圖 |
| --- | --- |
| 1. 使用者設定 | [01-settings.png](01-settings.png) |
| 2. 運送地址與付款偏好 | [02-shipping.png](02-shipping.png) |
| 3. 四項偏好權重 | [03-preferences.png](03-preferences.png) |
| 4. 首頁輸入需求 | [04-home.png](04-home.png) |
| 5. 動態處理進度 | [05-progress.png](05-progress.png) |
| 6. 商品滑動卡片 | [06-products.png](06-products.png) |
| 7. 自動帶入收件資料 | [07-checkout-address.png](07-checkout-address.png) |
| 8. 確認測試購買 | [08-checkout-confirm.png](08-checkout-confirm.png) |
| 9. 測試訂單完成 | [09-receipt.png](09-receipt.png) |
| 10. 歷史側欄 | [10-history.png](10-history.png) |
| 11. 手指左滑中的卡片 | [11-swipe.png](11-swipe.png) |

進度截圖為便於展示，暫停輪詢在 API 初始狀態；百分比是階段進度，不是實測模型耗時。其他購買畫面均由完整離線流程實際產生。

重現：先在專案根目錄執行 `npm run dev:mobile`，另一個終端執行 `node tests/mobile-screenshots.mjs`（需安裝 Edge）。腳本使用全新瀏覽器上下文，驗證收件自動帶入、測試結帳、重新整理訂單、不同瀏覽器資料隔離，以及禁止讀取原始 DB。

手機連同一個可信任 Wi-Fi，使用啟動終端印出的 `http://電腦IP:5174/chat`；IP 會隨網路改變。
