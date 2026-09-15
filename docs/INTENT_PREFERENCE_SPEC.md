# intent.md / preference.md 定義與分類

本文是現行文件語意基準；「目前實作」與「待實作目標」分開列示。共用 API 欄位仍為 v0.3，不新增或改名。

新增使用者設定：依 [BUYER_SETUP.md](BUYER_SETUP.md)，buyer_profiles 在 SQLite 保存基本資料與四項偏好權重／顏色。GET／POST /api/buyer-profile 是獨立明示更新，不是 Formatter 改寫 user_preferences。新 Request 凍結 ranking_weights；未指定 preference_md 時才以 profile 顏色建立本輪文字快照。自訂 preference_md 優先；姓名、地址、付款方式不進 intent、RFQ 或模型。以下「尚無長期偏好 UI」僅指 user_preferences 的一般讀寫／學習，不包括這個限定的 profile 設定。

Buyer Request Improver 已接上 `selection_version: 1` 決策與前端進度，見 [IMPROVER.md](IMPROVER.md)。只有明確長期表述可更新共用 versioned preference repository；Frontend sessionStorage 文件草稿仍不是持久偏好正本。

## 1. 三層資料，不是三份互相覆寫的文件

| 層級 | 定義 | 生命週期 | 範例 |
| --- | --- | --- | --- |
| 長期 preference.md | 使用者跨次購買的偏好之可讀表示；須有適用品類 | 跨 Request，更新須經獨立流程 | 滑鼠偏好黑色、小尺寸；重視評分；不接受付費配件 |
| 本輪 intent.md | 這次要買什麼、用途、預算／交期／必要規格，以及這輪例外或軟偏好 | 單一 Request | 買辦公滑鼠，目標 800、含稅運最多 1,000、7 天內收到；這次要白色 |
| 本輪 NormalizedIntent | Formatter 將本輪文字與可用偏好合併、驗證後的執行條件 | 隨 Request 固定 | category、max_total_twd、delivery_days_max、product_preferences、negotiation_policy |

**不是 intent.md 生成並覆蓋長期 preference.md。** 本輪客製化偏好屬於本輪 intent / NormalizedIntent；長期偏好只是輸入之一。

目標概念：本次使用者輸入＋相關長期偏好 → 本輪購買意圖 → 結構化條件 → 搜尋／議價／評估。目前 Formatter 直接產生結構化條件，**尚未另行生成一份新的 intent.md Markdown**。

API 的 `preference_md` 是這次提交的偏好文件**快照**，不等於修改長期偏好的命令。可以源自長期文件，也可以是使用者這次提供的偏好文字；提交後僅影響該 Request。

## 2. 條件如何分類

「存在 intent 還是 preference」是作用範圍；「required 還是 preferred」是強度。兩個維度不可混為一談。

| 分類 | 應放的位置 | 執行方式 |
| --- | --- | --- |
| 本次商品、數量、用途 | intent.md | 目前 MVP 一隻無線滑鼠，最多一個相關滑鼠墊 |
| 本次最高預算、到貨期限 | intent.md | 硬限制；不能因價格排序或偏好而放寬 |
| 本次目標價（800 左右） | intent.md | 軟搜尋目標；選填，不等於預算上限，也不等於「價格優先」 |
| 顏色、尺寸、外型、規格 | 長期通則放 preference；本次例外放 intent | 明示必要條件為 required；喜歡／偏好為 preferred |
| 價格、交期、信任的優先順序 | 長期通則放 preference；本次排序要求放 intent | 軟排序依據，不得讓違反硬限制的商品變合格 |
| 配件與付費加購授權 | 長期通則放 preference；本次例外放 intent | 獨立授權規則；未授權付費時，只能無額外費用的相關可拒絕配件 |
| 賣家評分、庫存、商品價格、廣告 | 不放在買家偏好當作可信事實 | Backend 從目錄／信任／Campaign 資料取得；廣告不影響排名 |
| 左滑／拒絕原因 | feedback／互動紀錄 | 是更新偏好的證據，不是自動生效的新 preference |

長期偏好可包含使用者明示的硬要求，例如「不接受付費配件」；不因它放在 preference.md 就當作可忽略的軟偏好。推測或行為學習不得自行升級成硬限制、提高預算或授權付款。

## 3. 優先順序與衝突

目前對同一商品屬性採：**本輪 intent_md > 本次 preference snapshot > Request 綁定的 SQLite versioned preference**。高優先來源替換同屬性的低優先來源，其他未衝突屬性保留。同一來源的矛盾不能用最後一句猜測解決，需澄清。

- 長期喜歡黑色、本次要白色 → 本輪白色，長期仍為黑色。
- 本次沒提顏色 → 繼承本次偏好快照或已儲存偏好。
- 同次意圖同時「只接受黑色」與「只接受白色」→ needs_clarification。
- 舊的前端意圖模板預算 1,000，本次又輸入 800 上限 → 目前合併為同一份意圖，會澄清，不會自動判斷 800 是改寫指令；請先清除舊條件。
- 本輪 800 左右但沒有最高預算／交期 → 目前 Formatter 需澄清；不能從「喜歡便宜」推算硬預算。

目前 budget／delivery 可從本次 preference_md 解析，作為相容輸入，但僅屬本輪條件，不寫成長期設定。新文件應把本次金額／期限寫在 intent.md。

SQLite preference 支援 scoped 商品屬性、Markdown revision 與 ranking weights；新增品類仍須明確定義 scope，不能把「小滑鼠」偏好套到螢幕。Demo buyer 不等於正式帳號或跨裝置同步。

## 4. 現行欄位與儲存位置

| 資料 | 現在存在哪 | 是否會自動更新長期偏好 |
| --- | --- | --- |
| 編輯中的 intent / preference 與已儲存模板 | 前端 sessionStorage，限本分頁 | 否；「儲存設定」不是同步帳戶偏好 |
| Buyer profile、顏色與 ranking weights | buyer_profiles + improver_global_preferences | 只有明示 POST profile 更新 |
| 本輪原文 | requests.intent_md、requests.preference_md | 否；保留提交原文，不拿模型改寫取代 |
| 合併後本輪條件 | requests.normalized_intent_json | 否；只供本輪執行 |
| 解析輸入、採用的 DB 偏好快照與結果 | formatter_runs | 否；不可變稽核與冪等重播 |
| Versioned 長期偏好 | improver_global_preferences | Buyer profile 明示更新，或有 evidence 的 Improver patch |
| 拒絕回饋與原始文件 | decisions.result_json、RequestSnapshot.decision | 否；可建立獨立追問子請求，不修改長期偏好 |
| 逐卡左滑 | 前端該對話的 skipped 狀態 | 否；目前未逐筆寫入 feedback_events |

API 省略 `preference_md` 或傳入空字串，都不表示清除持久偏好。Formatter 使用 Request 綁定的 versioned preference；非空文字在沒有既有版本時可作相容初始化，既有權威版本不能被 client cache 靜默覆寫。

`.md` 名稱在目前產品中是文字欄位的可讀名稱，不是自動寫入磁碟的真實檔案。SQLite 是持久資料正本；Agent 對話記憶與瀏覽器草稿都不是長期偏好正本。

## 5. 目前流程與待辦

已實作：直接輸入本次購買需求 → CreateRequest.intent_md → Formatter 讀取 DB 偏好、解析與合併 → NormalizedIntent → Discovery → Negotiation → Evaluator。不必先寫或儲存 intent.md。

代理設定為選填，初始草稿與已儲存文字均為空。只有已儲存的意圖模板非空時，才以「模板＋兩個換行＋## 本次購買需求＋換行＋trim 後本次輸入」組合 intent_md；未設定或只有空白時直接使用 trim 後本次輸入。preference_md 原樣取已儲存偏好，未設定為空字串。未儲存的編輯不套用，也不阻擋送出。可只儲存偏好，或清空模板後儲存；既有分頁資料不自動刪除。

API 的 intent_md 仍必須非空，保留文件長度、冪等與安全驗證。取消的是「先儲存模板」限制，不是 Formatter 的硬條件驗證；缺少最高預算或到貨期限仍需澄清。

`intent.md` 編輯框目前是組成本輪意圖的可重用模板，並不是已生成的本輪最終文件。建議模板只填商品／用途，不填上次交易的金額和期限；這些寫在本次輸入。

待實作，不能宣稱已完成：

1. 正式帳號、權限、資料保留政策與跨裝置同步。
2. Buyer Agent 另行產生可閱讀的新 intent Markdown，同時保留原始輸入與來源證據。
3. 逐次保存左滑事件並區分「只限本輪」或「以後都這樣」；單次不喜歡不能推論整個品牌／Seller。
4. Formatter 問答及拒絕後 Improver child 已支援，見 [CLARIFICATION_SPEC.md](CLARIFICATION_SPEC.md) 與 [IMPROVER.md](IMPROVER.md)。

### Formatter 補充問答

`needs_clarification` 可直接回答並繼續，包含依 preference_md／SQLite 商品偏好提供的快捷答案與手動輸入。已有偏好能決定的條件不再問；缺少選填顏色、尺寸不會單獨觸發追問。明確回答可解決 parent 的歧義；原 parent 與原 formatter_runs 保留，child 保存附加回答、parent ID、root ID 與遞增 revision。拒絕後也可先建立獨立追問子請求，回答後再跑完整比價；不修改長期偏好或原報價。

## 6. 驗收

可執行測資：`contracts/fixtures/document-semantics.json`；測試：`tests/document-semantics.test.ts`。驗收包含本輪白色覆寫長期黑色但不修改已綁定版本、空文件仍繼承、矛盾澄清，以及明確區分本輪結果與未來更新。
