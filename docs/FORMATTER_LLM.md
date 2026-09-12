# LLM Formatter

## 預設模型與費用

目前預設 `gpt-5.6-sol`，以 `reasoning.effort: none` 處理結構化需求抽取；UI 可改用 GPT-4.1 或 GPT-4.1 Mini。Sol 並非最低費用選項，請依官方計價與實際 token 用量控制成本：[模型與價格](https://developers.openai.com/api/docs/models/gpt-5.6-sol)。完整設定優先權、Runtime 共用模型及驗證範圍见 [MODEL_HISTORY_SYNC.md](MODEL_HISTORY_SYNC.md)。

Responses API 使用 `text.format` 的 strict JSON Schema，詳見 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。模型負責抽取，Backend 再驗證，不直接相信模型自行宣告成功。

## 安全設定 key

不要再貼 key 到聊天、issue 或程式碼。已在對話暴露的 key 建議立即撤銷，並建立新的低額度、最小權限專案 key。本次未把聊天中的 key 複製進任何專案檔案或工具命令。

Windows 執行：

```bash
npm run demo:formatter:secure
```

終端機會要求 **隱藏輸入** 新 key，不進 shell 命令歷史、不寫 .env；暫時放入該程序的 OPENAI_API_KEY，供子程序呼叫官方 OpenAI API，結束後還原。這是程序環境保護，不是硬體密鑰保管庫；有本機高權限／除錯權限的人仍可能讀取記憶體。Production 應由部署平台 Secret Manager 注入環境變數。

已有程序環境變數時可用 `npm run demo:formatter:llm`。`.env.example` 只有空白占位，不會自動載入 .env。`OPENAI_FORMATTER_MODEL` 可覆寫模型，改用其他模型前需自行驗證費用與 Structured Outputs 相容性。

## 接上目前流程

```ts
import { createLlmFormatterService } from './src/formatter/llm-service.ts';
const service = createLlmFormatterService({
  db, userId: authenticatedUserId, registrations, timeoutMs: 3000,
}); // 從 OPENAI_API_KEY 讀取，不把 key 放在業務參數
const result = await service.prepare_from_text({
  intent_md: '想找黑色安靜的滑鼠，八百左右，最高一千元，七天內到貨',
  idempotency_key: 'llm-request-001', snapshot_id: 'discovery_demo_v02',
});
// result.handoff 非 null 才可另呼叫 dispatch_first_round。
```

與同步規則版的差別是 submit／prepare_from_text 需要 `await`。已存在同 key 的結果直接重播，不再打 API。同 instance 的併發呼叫合併；不同 Backend process 同時首次提交仍可能重複 API 費用，但 DB 唯一鍵及二次查詢不會產生重複 Request。本版沒有跨程序 distributed lock。

LLM 只收到本次 intent_md／preference_md，不收到 API key（除認證 header）、賣場測資、價格底線、廣告、使用者 ID 或整個 SQLite。SQLite 長期偏好在 API 完成後以本機交易讀取並合併，保存當下快照；本次明確屬性優先，不覆寫歷史資料。沒有跨網路 await 持有 SQLite transaction。

輸出 schema 為 `contracts/openai/formatter-output.schema.json`。產品偏好、最高預算、目標價與交期要求原文 evidence；本地驗證來源子字串與可辨識數字、正整數、偏好衝突及共用 NormalizedIntent。Structured Outputs 不保證語意絕對正確，正式產品仍應展示需求摘要供使用者確認；保留原始 quote 以便稽核。

只允許無線滑鼠及免費可拒絕配件；付費加購／未支援條件要求澄清。沒有最高預算或交期時不捏造；只給目標價仍需要補充現有契約要求的硬限制。

## 費用、失敗與資料處理

- 每次首次提交最多一個 API request，不自動 retry，也不呼叫昂貴模型補救。
- 預設 45 秒 timeout（原 15 秒）、最多 1,800 output tokens；文件各最多 20,000 字元，沿用 CreateRequest。這是單次限額，不是帳戶總花費上限；帳戶仍需設定預算及警示。提高等待時間是容錯調整，不宣稱先前失敗必然是 timeout。
- `store:false`，不要求保存 Responses 物件；**不代表 OpenAI 沒有服務端安全／合規紀錄，也不是 Zero Data Retention 承諾**。
- 固定官方 HTTPS endpoint，拒絕 redirect；不記錄 Authorization、API error body 或原始 exception。業務輸入若疑似貼入 API key，先拒絕、不送出、不存 DB。
- 401／429／5xx、timeout、refusal、截斷、格式不符或 evidence 不符 → 明確 warnings 的離線規則 fallback。fallback 仍無法理解則 needs_clarification；parser_version 可區分 LLM 與 rules，成功時 warnings 記錄選用模型。
- 缺 key 屬配置錯誤，直接回 missing_openai_api_key，不偽裝 LLM 成功。
- 原始需求與解析結果仍依現有產品需求保存 SQLite；不要把密碼或個資混入購物原文。

## 測試狀態

### 真實呼叫診斷（更新）

`npm run demo:formatter:secure` 現在使用 `failureMode:'throw'`，不接受 fallback 當作 live 成功。成功會印 `LLM_API_SUCCESS`；失敗印 `LLM_DIAGNOSTIC` 與非零 exit code，不建立 fallback Request。正常 Backend 可保留預設 fallback，或以第二參數 `{failureMode:'throw'}` 採严格模式。

診斷只含本地白名單 code／message、stage、HTTP status、經過格式限制的 request ID、elapsed_ms；不印 key、provider error message/body、prompt 或原始 exception。不要為了 debug 開啟任意 request/header dump。

| code | 下一步 |
| --- | --- |
| authentication | 重新確認完整 key、撤銷狀態與專案 |
| invalid_key_format | 不要輸入星號、引號、Markdown 反斜線；前後空白會自動 trim |
| quota | 檢查 API billing／專案額度；不是修改 parser 能修好 |
| rate_limit | 手動稍後重試，沒有自動計費 retry |
| permission / model_unavailable | 檢查 key 權限與模型存取 |
| network / tls / timeout | 檢查本機網路／代理／憑證，不能關閉 TLS 驗證 |
| request_schema / bad_request | 把安全診斷交給開發者修正 request |
| output_schema / output_evidence / output_semantics | API 已回應，但本地驗證拒絕，不可當作解析成功 |

增加了與 Demo 相同中文數字語句的回歸測試。模型只引用「一千元」時，若原文緊鄰的同句含「最多／最高」也可通過硬預算佐證；只有「八百左右」仍不能當成硬上限。這不放寬未知數值或非原文的來源檢查。

`npm run test:formatter` 使用 mock fetch，不需 key、不花費，涵蓋 strict schema、官方 endpoint、資料最小化、錯誤隔離、fallback、併發重播與完整 DB 接線。2026-09-12 使用者在本機隱藏輸入 key 後回傳 `LLM_API_SUCCESS`、`formatter-llm-v0.1`／ready 與五家搜尋結果，已確認該次真實 API 至搜尋接線成功（不是代理自行持有 key 呼叫）。Seller 仍是 demo 替身，live Demo 不啟動議價或購買。

該次 live 回應另顯示模型將「八百左右」推定為 price_first；已加回歸防護：排序優先權需有明確語句佐證，否則移除並警告，目標價仍照一般綜合排序使用。這個後續檢查已通過 mock 回歸測試，尚未宣稱再次 live 驗證。原始那次 fallback 沒有留下錯誤分類，無法回溯確認究竟是 key、timeout 或驗證哪一項所致。
