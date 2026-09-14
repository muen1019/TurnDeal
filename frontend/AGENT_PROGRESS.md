# Agent 執行進度接口

Chat 送出 request 後顯示 Formatter → Orchestrator → Negotiation → Evaluation。
進度由 HTTP 回應驅動；UI 不使用計時器推測 Agent 已完成工作。

## 現行正式 API

正式模式只使用既有 `GET /api/requests/{request_id}` 回傳的 v0.3 `RequestSnapshot.status`。由 useWorkspace 輪詢快照，進度元件不另發 HTTP 請求；後端目前沒有 `/progress` API，也不推測尚未提供的議價中間步驟。

RequestSnapshot 決定本輪是否真的完成及優惠是否可查看。
失敗狀態沒有提供失敗步驟時，UI 不推測哪一步失敗，也不擅自標記前面步驟成功。

## 前端介面

- `src/state/useAgentProgress.ts`：把正式快照狀態投影為進度狀態，不另發 HTTP 請求。
- `src/components/chat/AgentProgress.tsx`：以 `status`、`error` 呈現進度。
- `ChatPanel` 的 `progressStatus`、`progressError` 是畫面接入點。

前端已移除 Vite mock 與 `/__mock` sidecar；開發模式與 production build 使用相同 runtime API。
