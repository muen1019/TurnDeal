# Formatter

Formatter 把本輪 `intent_md`、request-bound `preference_md` 與可用的 SQLite preferences 合併成 `NormalizedIntent`。它不會生成或覆寫長期 preference 文件；完整語意見 [intent／preference 規格](INTENT_PREFERENCE_SPEC.md)。

## 行為

- 支援無線滑鼠、至多一張相關滑鼠墊、含稅運最高預算、目標價格、交期、顏色／尺寸／外型／功能、排序優先權與配件授權。
- 本輪明示條件優先於 request preference snapshot，再優先於 SQLite active preferences。
- 最高預算與交期是硬限制；「800 元左右」只是軟目標，不能推論成最高預算或價格優先。
- 缺少契約要求的預算／交期、同來源矛盾、付費配件未授權或未知必要條件時回 `needs_clarification`。
- 原始文件、採用的偏好來源、解析結果與 warnings 保存於 SQLite；相同 idempotency key 重播同一結果。

## 離線與模型模式

離線 parser 是預設及安全 fallback：

```powershell
npm run test:formatter
npm run demo:formatter
```

LLM formatter 使用 OpenAI Responses API、strict Structured Outputs 與 `contracts/openai/formatter-output.schema.json`。模型只負責抽取，Backend 仍驗證 evidence、數字、語意和共用 contract。

```powershell
npm run demo:formatter:secure
```

已有受保護的 server environment 時可用 `npm run demo:formatter:llm`。預設模型是 `gpt-4.1-mini`，可用 `OPENAI_FORMATTER_MODEL` 覆寫，但須重新確認 Structured Outputs 相容性與成本。

## 資料與安全

- API key 只從後端 process environment 讀取，不放入業務參數、SQLite、log 或前端 child environment。
- 模型只收到本輪文件，不收到 Seller catalog、底價、Campaign、buyer ID 或完整 SQLite。
- 固定官方 HTTPS endpoint、`store:false`、拒絕 redirect；不記錄 Authorization、provider error body 或原始 exception。
- 每次首次提交最多一個 request，不自動 retry；timeout、refusal、截斷、HTTP 或語意驗證失敗時使用帶 warning 的規則 fallback。
- 缺 key 是設定錯誤；secure diagnostic 模式不得把 fallback 偽裝成 live 成功。
- 本地原始需求仍會依產品需求保存；不要把密碼、API key 或不必要個資寫入購物文字。

## 內部接口

`src/formatter/service.ts` 提供規則版 service，`src/formatter/llm-service.ts` 提供 async LLM 版。兩者都可提交 Request、準備 Orchestrator handoff，並只在 intent ready 時繼續。

```ts
const result = await service.prepare_from_text({
  intent_md: '想找安靜的無線滑鼠，預算一千元含稅運，七天內到貨',
  preference_md: '價格優先，可接受免費滑鼠墊',
  idempotency_key: 'request-001',
  snapshot_id: 'discovery_demo_v02',
});
```

完整 HTTP 流程由 root runtime 提供；獨立 formatter demo 的 Seller 是測試替身。
