# Buyer Request Improver

Improver 在使用者拒絕全部方案，或採用前曾拒絕部分方案時，保存回饋並建立獨立的文件 revision workflow。它不修改父 Request、已發布 Offer、decision 或已接受方案。

## 核心流程

```text
Context Builder
  → deterministic or one bounded LLM proposal
  → schema / evidence / semantic validation
  → immutable revision commit
  → clarification or one linked child request
```

- intent revision 是 request-scoped。
- 只有明確且受支援的長期表述才可產生 global preference patch；左滑或單次偏好不能自動學習。
- 無模型、逾時或非法輸出時建立安全 draft／澄清問題，不把 fallback 標成 LLM 成功。
- SQLite 保存輸入、lease、嘗試次數、文件版本、偏好版本與 patch audit。失效 worker 不能提交。
- 父 Request 的原始文件和 snapshot 永遠不改寫。

## Selection API

決策使用 `selection_version: 1`：

```json
{"action":"reject","selection_version":1,"rejected_offer_ids":["offer_1","offer_2"],"feedback":""}
```

全部拒絕時，ID 必須精確等於目前完整、非空且未過期的 ranked Offer set。接受時可附上先前拒絕的子集合，但不得包含 accepted Offer。第一張直接接受且 rejected set 為空時不建立 improvement job。

決策與 job enqueue 在同一 transaction 保存；API 回傳已保存的 decision 後，worker 才執行改善。Legacy unversioned decision 不會加入這個 workflow。

## 狀態與澄清

`GET /api/requests/{request_id}/improvement` 回傳：

- `status`：`queued`、`running`、`ready`、`needs_clarification` 或 `failed`；
- `result`：文件 revision、狀態、問題與 preference update 結果；
- `can_clarify`、`next_request_id`、`workflow_error` 與 job error。

只有 `can_clarify=true` 才提交：

```http
POST /api/requests/{request_id}/improvement/clarifications
Idempotency-Key: <stable-key>
```

```json
{"improvement_id":"imp_current","feedback":"這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。"}
```

feedback 是完整替代調整指示，不會把多次澄清文字暗中串接。Client 必須保存 exact body 與 key，逾時或 reload 後用相同內容重送。

`next_request_id` 非 null 才代表 child 已建立。Client 只需用既有 GET Request flow 開啟它，不能自行再 POST 第二個 Request。Child 使用已提交的 intent／preference revision 與 frozen Formatter output。

## Preference 邊界

全域 preference 使用可定位區塊；無法安全定位或與未管理自由文字衝突時保持原文，不整份覆寫。

```markdown
<!-- offermesh-preference:mouse_size scope=category:mouse -->
偏好小尺寸
<!-- /offermesh-preference -->
```

目前 `improver_global_preferences` 尚未取代 Formatter 的 `user_preferences`，一般新對話與 account-level preference editor 也尚未同步。不要宣稱改善結果已成為所有未來 Request 的權威偏好。

## 執行

```powershell
npm run test:improver
npm run demo:improver
npm run demo:improver:live
```

前兩者不需要 key。Live mode 預設使用 `gpt-4.1-mini`，以 server-side `API_KEY`／`IMPROVER_MODEL` 設定；key 不得注入 Vite 或寫入 log。Integrated runtime 每五秒恢復既有 queued 或 lease 到期的 job，不掃描歷史 decision 補建工作。
