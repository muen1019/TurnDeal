# Marketplace 測資與來源政策

`marketplace-source-snapshot.json` 保存 Demo 使用的公開商品證據；`sellers.json` 則是可重現的 Seller 執行資料。兩者不可混為同一種真實性。

## 哪些欄位來自公開資料

- 商品品牌、型號、顏色與公開規格。
- 搜尋或商品頁當時顯示的價格與幣別。
- 來源 URL、擷取時間與資料新鮮度。

台灣主 Demo 的商品價格以 Shopee 台灣公開結果為種子。Amazon.ie 資料因索引快取較舊，只用於跨市場參考與資料管線展示，不進入 TWD 報價、Eligibility 或兌換。

## 哪些欄位是刻意模擬

- Seller 名稱與個人／市場信任分數。
- 庫存、交期、底價、每輪折扣與拒絕／timeout 行為。
- Sponsored campaign、Quote 到期時間與最終含稅運總價。

公開頁面通常無法證明商家的真正庫存、可談底價或跨平台到貨承諾，因此這些欄位必須標記為 `synthetic`。Demo 不宣稱與 Shopee、Amazon 或 Logitech 有合作關係。

## 使用規則

1. 執行 Demo 時只讀固定 fixture，不在請求流程中即時爬站，避免網路或網站變更讓展示失敗。
2. UI 若顯示公開參考價，必須同時顯示來源、擷取日期與「價格可能已變動」。
3. 不將折價券、信用卡回饋或會員價視為所有使用者都能取得的價格。
4. 外幣資料不自行換算成 TWD Offer；若未來需要換匯，必須另存匯率來源與時間。
5. 每次重新擷取建立新的 `snapshot_id`，不要覆寫舊快照，才能重現既有 Demo。
6. 不保存登入後資料、買家個資、評論全文、圖片或受限制的頁面內容。

## 目前來源覆蓋

| 來源 | 用途 | Demo 決策權重 |
| --- | --- | --- |
| Shopee Taiwan | M240、M350s、M331、M221 與 Studio Series 滑鼠墊的公開價格快照 | 可作為台灣 Catalog 種子，不是成交保證 |
| Amazon.ie | M240、M350s 的跨市場舊快取價格與商品欄位 | 僅參考，權重為零 |
| Logitech 官方 | 尺寸、外型、連線與 SilentTouch 規格 | 規格佐證，不提供 Seller 商務條件 |

完整 URL、價格與新鮮度在 `marketplace-source-snapshot.json`。下一次更新公開資料時，先新增快照，再調整 `sellers.json`，最後執行 `npm test`。
