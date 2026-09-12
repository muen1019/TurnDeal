## 1. 契約與資料層（測試交易已實作）

- [x] 1.1 固定 ACP schema、版本、來源與 hash；驗證官方文件／事件 enum 差異，無一致契約不接線。
- [x] 1.2 新增 purchase.v1 schema 與 OpenAPI，覆蓋所有 request／response、error、狀態、禁用欄位及測試 fixtures，產生 routes／types。
- [x] 1.3 新增下一個可用 migration：purchase、operation journal、merchant session／order、purchase order、outbox／inbox；驗證唯一約束及既有資料保留。
- [x] 1.4 實作 buyer／seller／offer 映射與整數 TWD minor-unit 轉換，測試贈品、分項加總、篡改及過期。

## 2. ACP 與購買流程（測試交易已實作）

- [x] 2.1 實作 ACP HTTP client 與 merchant 五端點，驗證固定 wire schema、credentials、allowlist、headers、測試簽章及商家隔離。
- [x] 2.2 實作交易綁定的付款 simulator、測試 inventory 及原子唯一訂單／token 消耗／outbox；拒絕未配置 live。
- [x] 2.3 實作 purchase create/get/update/cancel，通過所有權、未知欄位、accepted-only 與 error scenarios。
- [x] 2.4 實作 confirmation_token 與 complete，驗證明確確認、revision／expiry、重驗報價及禁止自動 complete。
- [x] 2.5 實作 durable operations、冪等、互斥及 restart worker；驗證不同 key 競爭、create／complete 丟失回應、過期後核對同一訂單。
- [x] 2.6 實作簽名 merchant event 接收／重送／去重／GET 核對，驗證偽造、跨 seller、重送與亂序。

## 3. 後端交付驗證

- [x] 3.1 執行 purchase API → ACP HTTP → 訂單、並行與重啟恢復測試。
- [x] 3.2 驗證共用契約、資料库與後端 regression tests。
- [x] 3.3 文件明示本提交不含前端實作或 UI 驗收，正式付款未實作。
