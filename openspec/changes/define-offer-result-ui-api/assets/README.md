# UI 概念圖

以下為設計參考，尚未實作。四張均為 1536×1024 PNG；滑卡沿用 Chat 的完整桌面外框與側欄，不是手機版放大。圖片由 imagegen 生成，商品與金額為示意，不作 backend fixture 或可信商品資料。

| 圖片 | 展示內容 |
| --- | --- |
| [Chat](chat-reference-v1.png) | 對話、需求輸入及 Buyer Agent 定義側欄 |
| [優惠瀏覽](swipe-desktop-rest-v1.png) | 共用桌面 AppShell、簡化橫向卡片、明細入口 |
| [左滑回饋](swipe-desktop-left-v1.png) | 卡片左移、右側略過提示 |
| [右滑回饋](swipe-desktop-right-v1.png) | 卡片右移、左側採用提示；放開才提交 |

精確尺寸、間距、可用狀態及動效以 [design.md](../design.md) 第 8–11 節與 requirements 為準。生成圖之間的卡片內距、標題字級、按鈕位置及重複導覽連結可能略有差異；實作須共用元件，不將這些差異各自做成樣式。drag 前後只可移動卡片，其他元素的位置需通過 bounding-box 驗收。

Chat 圖的「其他定義」對應契約實際支援的 preference.md；保存狀態必須標明本分頁範圍。未支援的附件／帳號圖示不作有效功能，Sponsored 是否顯示依真實快照，而非依圖片省略。
