# Agent 執行進度接口

Chat 送出 request 後顯示 Formatter → Orchestrator → Negotiation → Evaluation。
進度由 HTTP 回應驅動；UI 不使用計時器推測 Agent 已完成工作。

## 現行正式 API

正式模式只使用既有 `GET /api/requests/{request_id}` 回傳的 v0.3 `RequestSnapshot.status`。由 useWorkspace 輪詢快照，進度元件不另發 HTTP 請求；後端目前沒有 `/progress` API，也不推測尚未提供的議價中間步驟。

## 開發 mock 專用進度

僅在 Vite dev 且 `OFFERMESH_DEV_MOCK=1` 時查詢 `GET /__mock/requests/{request_id}/progress`：

```json
{
  "request_id": "req_example",
  "sequence": 3,
  "stage": "negotiating"
}
```

| 欄位 | 定義 |
| --- | --- |
| request_id | 必須與查詢中的 request 相同 |
| sequence | 非負整數；同一 request 的新進度遞增，重複查詢可相同 |
| stage | `formatting`、`orchestrating`、`negotiating`、`evaluating`、`awaiting_user`、`failed`、`needs_clarification`、`needs_confirmation`、`no_match` |

此為 Vite mock 工具接口，不屬於 backend/OpenAPI；不向共用 contract 的 RequestSnapshot 新增狀態。production build 關閉 mock，正式 API 模式不請求此路徑。

前端每秒查詢一次，切換 request 或離開元件時取消舊查詢。
較舊 sequence、錯誤 request_id 與不合法 stage 不會覆蓋有效進度。
mock 回傳 404 時停止該 request 的進度查詢，使用現有快照狀態。
暫時錯誤顯示更新中斷提示並繼續嘗試查詢，不模擬成功。

RequestSnapshot 決定本輪是否真的完成及優惠是否可查看。
即使進度接口先回 `awaiting_user`，UI 仍等待快照，避免提前顯示可採用優惠。
失敗狀態沒有提供失敗步驟時，UI 不推測哪一步失敗，也不擅自標記前面步驟成功。

## 前端介面

- `src/api/progress.ts`：讀取及驗證開發 mock 的進度回應。
- `src/state/useAgentProgress.ts`：管理輪詢、request 範圍與快照優先順序。
- `src/components/chat/AgentProgress.tsx`：以 `status`、`error` 呈現進度。
- `ChatPanel` 的 `progressStatus`、`progressError` 是畫面接入點。

開發 mock 的啟動方式見 [README](README.md)。Mock 使用固定契約 fixture；
用於檢視流程的示範條件是無線滑鼠、預算 NT$1,000、7 天內送達。
它不執行實際 Agent、購買或付款，也不代表已完成正式後端進度整合。
