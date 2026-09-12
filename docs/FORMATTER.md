# Formatter v0.1：中文文字到搜尋與 Seller 交接

**LLM 入口已新增**：使用 `createLlmFormatterService`，預設 gpt-4.1-mini，見 [FORMATTER_LLM.md](FORMATTER_LLM.md)。本文保留同步規則版說明，現在作為離線測試及 LLM 失敗 fallback。

## 範圍

文件定義、分類、來源優先順序與目前／待辦的界線以 [INTENT_PREFERENCE_SPEC.md](INTENT_PREFERENCE_SPEC.md) 為準。本輪解析不更新長期偏好，不自動生成新的 Markdown 文件。

本版為可離線重現的 **中文規則 Formatter**，不是 LLM，也不宣稱理解任意自然語言。已串接：

文字 → 解析與驗證 → 合併使用者偏好 → SQLite Request／Formatter 快照 → Discovery → RFQ → 第一輪 Seller 函式。

FormatterResult 使用共用 v0.3 schema；根目錄完整服務已接上 HTTP、五家議價與 Evaluator，見 [RUN_FULL_APP.md](RUN_FULL_APP.md)。本文件的 formatter 單獨 demo 仍使用 Seller 測試替身，不代表完整服務也使用替身。

## 支援的輸入例子

```text
想買800元左右的無線靜音滑鼠，最高1000元，7天內到貨，
只接受黑色，偏好小尺寸、左右對稱，價格優先
```

| 中文表達 | 解析結果 |
| --- | --- |
| 800元左右／800左右／約800元 | 搜尋目標價 800；不是硬預算上限 |
| 最高1000元／預算1000元／1000元以內 | 含稅運費的 max_total_twd=1000 |
| 7天內到貨／一週內 | delivery_days_max=7 |
| 無線／靜音／藍牙 | wireless / silent_click / bluetooth |
| 黑色、白色、粉色／粉紅色、紅色、藍色 | color 條件 |
| 白色或粉色 | 同一條件的多值選項 |
| 不要黑色／排除黑色 | required + not_in |
| 小尺寸／中尺寸／大尺寸、左右對稱／右手型 | size_class / shape 條件 |
| 偏好／喜歡 + 商品屬性 | 軟偏好；一般直接指定屬性或只接受／必須則為硬條件 |
| 價格優先／交期優先／評分優先 | price_first / delivery_first / trust_first |
| 不要配件／不要贈品／不要滑鼠墊 | disabled 搭售政策 |

預設商品範圍是無線滑鼠；原文沒提無線時會在 warnings 明示套用範圍。預設只允許可拒絕的免費相關配件，絕不推定付費加購授權。

品牌、DPI、重量、任意數字範圍、日期、英文、條件式、複雜語意、付費加購目前不做猜測；未被規則理解的剩餘文字會進 questions，阻止議價。請用逗號分開條件、數字使用阿拉伯數字；一週是特別支援的例外。這是有界 MVP，不是一般購物語言理解器。

## 缺少價格時

「搜尋目標價格」仍選填：`買滑鼠，最高1000元，7天內到貨` 可直接往下跑，不會把 1000 偷當目標價。

現有 NormalizedIntent 契約仍要求最高預算及交期；`買800左右的滑鼠` 會回 needs_clarification，詢問最高預算及交期，normalized_intent=null，也不呼叫 Seller。純 Discovery 的無價格搜尋功能保持可用，但本 Formatter 不捏造一筆可議價需求。

兩個不同硬上限、必要顏色互相排斥、目標高於上限也要求澄清。規則未理解或輸入矛盾時，不拿部分猜測結果冒充 ready。

## 偏好順序與儲存

同一商品屬性：本次 intent_md > 本次 preference_md > SQLite active user_preferences。當下明確指定可取代同屬性的歷史偏好；當下本身的衝突仍需澄清。

只讀取 Backend 綁定 userId 的偏好，不從呼叫參數接受 userId。支援 DB in / not_in，prefer / avoid 轉為 in / not_in；weak 轉成 preferred，required 保留。range 的 values_json 使用 `{ "min": 90, "max": 120 }`，類別選項使用字串陣列。無效／不支援的已啟用紀錄會阻止提交 ready，不靜默丟掉。

`formatter_runs` 保存原始輸入、當時完整偏好列與解析結果。Request 保存原文、合併後 NormalizedIntent 與 orchestrating／needs_clarification 狀態。已儲存的格式化結果與需求欄位不可更新；長期偏好之後改變不會改寫舊結果。

目前補充需求方式是重送完整、修正後的文字並使用新 idempotency_key，建立新 Request；尚未實作多回合對話澄清或 child revision UI。published_snapshot_json 仍保留 null，沒有把 Formatter 的局部結果冒充完整 RequestSnapshot。

## 直接呼叫

```ts
import { createFormatterService } from './src/formatter/service.ts';

const service = createFormatterService({
  db, userId: authenticatedUserId,
  registrations, // 已實作 Seller 的函式 registry；沿用 Orchestrator 介面
  timeoutMs: 3000,
});
const result = service.prepare_from_text({
  intent_md: '買800元左右的滑鼠，最高1000元，7天內到貨，只接受黑色',
  preference_md: '偏好小尺寸',
  idempotency_key: 'new-request-001',
  snapshot_id: 'discovery_demo_v02',
});
if (result.handoff) {
  // 明確另行啟動；格式化與準備本身不呼叫 Seller。
  const untrustedResults = await service.dispatch_first_round({
    handoff_id: result.handoff.handoff_id,
  });
}
```

- `formatIntent(input, savedPreferences?)`：純函式，只解析，不讀寫 DB。
- `service.submit(input)`：解析、存 Request 與稽核紀錄，不搜尋。
- `service.prepare_from_text(input + snapshot_id)`：submit 後，ready 才接現有 handoff.prepare。
- `service.dispatch_first_round(...)`：沿用既有所有權檢查、逾時、重播保護。Seller 仍只收到 RFQ，不收到原文、最高預算或使用者歷史。

同 user + key + 相同原文重播同 Request／同偏好快照；同 key 改文字拒絕。搜尋快照更換須新 key；prepare 失敗時已保存的 Formatter 結果保留，可用同輸入重試，不重建 Request。

這仍是 TypeScript 函式接口，沒有新增 HTTP endpoint、LLM provider 或真實交易功能。

## 執行

```bash
npm run db:migrate  # 既有 DB：先備份再套用 004_formatter，不重建舊資料
npm run test:formatter
npm run demo:formatter
npm run demo:formatter -- "買800左右的滑鼠"
npm test
```

Demo 在記憶體 SQLite 執行，不寫入本地 DB。主要檔案：`src/formatter/parser.ts`、`src/formatter/service.ts`、`contracts/fixtures/formatter-scenarios.json`、`tests/formatter.test.ts`。
