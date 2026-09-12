# 五種商業策略與條件交換

最新實作見 [SELLER_POLICY_IMPLEMENTATION.md](SELLER_POLICY_IMPLEMENTATION.md)：Persona 預先綁定賣家，真實模型在合法範圍內選價，並支援售後偏好匹配。下文價格排程為 deterministic 展示路徑，不是每次真實模型的固定出價。完整目標見 [SELLER_POLICY_DESIGN.md](SELLER_POLICY_DESIGN.md)。

本次依使用者指定，將展示配置改為五種不同經濟目標的 Seller。這些是模擬商家的可執行政策，不是五種說話語氣。商品／庫存、私有政策與已提交的協商狀態共同決定可報方案，LLM 只能在 Backend 計算的範圍內決策。

## 設定與執行

`contracts/fixtures/sales-profiles.json` 保存五家展示設定；`scripts/lib/sales-profiles.mjs` 將設定及模擬履約證據寫入 SQLite。`seller_persona_policies` 保存私有經濟目標、指定 SKU、折扣排程、權益開放輪次與停止輪次；`seller_benefit_catalog` 保存公開權益條款及私有可用數量、履約證據。既有 DB migration 預設不啟用 persona，不改寫歷史報價。

```bash
# Node 24，獨立記憶體示範，不修改既有資料庫
npm run demo:negotiate -- --personas --offline --memory
# 選出五家、協商、驗證、Evaluator 排序與 SQLite 重播，輸出 HTML/Markdown/JSON
npm run test:e2e:full
# 同一流程使用 .env 的 API_KEY
npm run test:e2e:full:live
```

未加 `--memory` 的 persona CLI 使用獨立 `data/persona-negotiation.sqlite`，首次建立時套用展示設定；一般 CLI 仍保留 canonical fixtures。所有 runtime SQLite 均不提交 Git。這裡的 E2E 從 SQLite 已解析需求開始，使用既有 handoff.prepare／Discovery 選賣家，不包含 Formatter 真實模型或 HTTP／前端整合。

## 經濟目標、籌碼與停止規則

| Seller | 目標與可談籌碼 | Backend 限制 | 停止規則 |
| --- | --- | --- | --- |
| A：Price Optimizer | 加速指定黑色 SKU 周轉；含稅運依序 609、594、579、564、549 元 | 只使用指定 SKU／庫存；不低於底價；不能跳到未開放的折扣；每輪報價有效 120 秒 | 完成第五次庫存折扣後 final；缺貨則拒絕 |
| B：Speed Seller | 保護 799 元物流溢價；第二輪一天到貨承諾、第三輪晚到補償 50 元 | 到貨承諾必須由目錄交期與有效履約證據支持；補償須符合申請條件，不減本次價格 | 第三輪開放最後物流權益後 final |
| C：Bundle Curator | 第二輪可送相關滑鼠墊；取消贈品可再議最多 30 元額外折讓 | 不擅自授權付費加購；底價、同款基準、配件庫存／交期／條款皆驗證；折現額度按整個 request 累計 | 折現額度耗盡或第四輪 final |
| D：Loyalty Builder | 保護 709 元本次價格；第二輪下次券 50 元、第三輪退貨期延長至 30 天 | 券需會員、下次滿 1000 元、發券後 30 天內一次使用；不得折現或扣本次價格；不自動加入會員 | 第三輪開放最後回購權益後 final |
| E：Margin Guardian | 保護 899 元售價；依序 730 天保固、一天內客服回覆、30 天瑕疵換貨 | 只能選已登錄且有可用履約額度的服务；維修／換貨的除外條件必須顯示 | 第三輪開放最後服務權益後 final |

價格是虛擬商家含稅運總價，不能再憑空「免一次運費」折抵。上述輪次是 Backend 開放權益的時機；模型可選擇已開放的權益，最後一輪須保留既有並包含全部仍可履約權益。模型可拒絕整場、Buyer 可提前停止；正常條件下的 deterministic 路徑會穩定展示全部五家。未來券、物流與售後目前以本地模擬履約證據驗證，沒有宣稱對應真實商家或已完成真實兌換。

## Buyer 與 Seller 如何對話

Buyer 可提出 `lower_price`、`add_gift`、`exchange_gift`、`compare`、`request_benefit`。每個 proposal 明確指定單買／組合、目標總價、自家參考報價；要求服務時另指定 `benefit_kind`。首輪先詢價，目標與參考 ID 都必須為 null。後續可自主還價，這個數字不會冒充其他商家的實際報價。Buyer 只有在至少兩次報價停滯、已嘗試還價且沒有未探索的贈品／折現／權益時，才可選 no_adjustment；價格優先且有尚未詢問折現的合格組合時，Backend 會要求先探索 exchange_gift，目標金額仍由模型提出。

例如 C 的離線流程：首輪單買 669 元；Buyer 第二輪要求同價加送滑鼠墊，Seller 報單買／組合 659 元；第三輪 Buyer 問取消贈品能否更便宜，Seller 在當輪普通價格 649 元上額外折讓 30 元，回覆单買 619 元／組合 649 元，額度耗盡後 final。

此時組合相對單買多 30 元：預設 no-extra-cost 的使用者只能把 619 元單買交給 Evaluator，649 元組合保留為 needs_confirmation；只有明示配件加價額度至少 30 元才可合格。不能以「之前是贈品」繞過授權。

Seller 的条件回覆為 accepted／countered／declined，Backend 根據實際 drafts 重算；拒絕一次還價不等於 refused 整個分支。價格與變更承諾由結構化資料決定，Seller message 不能自行創造商務條件。

模型先選主商品價格、是否包含可選組合、已登錄 benefit IDs；Backend 根據已用折現額度／組合政策生成獨立單買與組合價，避免模型報出無法成立的價格關係。這是對原草案「分開定價」的實作細化：最終有兩個獨立價格，但差額仍由私有政策約束。

## 狀態與信任邊界

- 每輪讀 SQLite 已提交的自家對話與報價；Agent 本身不保存可影響後續折扣的對話記憶。整場最多五輪，同步 barrier 不變。
- 本次仍沿用已確認的 v0.3 私有 RFQ。競爭資料最多帶最低單買、最快單買、最低組合三筆完整去識別化報價；同一筆去重。Backend 仍保存完整已驗證 context，不拼接價格／交期、不泄漏其他 Seller ID、Offer ID、底價、對話或政策。
- 私有政策只給自己的 Seller 模型。Buyer 只能知道公開的可用權益種類，不知道開放輪次、庫存底數、底價或折現上限。
- 模型越界、錯誤形狀、遺漏必須保留的權益時使用 deterministic fallback；所有輸出仍經 Backend 驗證。50 次呼叫、400000 token 保守預留、每次／每輪／全域 timeout 保持有界，不自動重試模型。原 250000 預留在加入完整權益條件後，兩次實测均在第三／四輪耗盡；已依測量將新請求啟動時的固定預留改為 400000，實際 API tokens 仍另記。
- 權益不能憑描述造出：公開定義必須精確匹配目錄及同 SKU 的有效證據、有可用數量；物流承諾還需符合目錄交期。缺貨、證據／條款變更會使相關报价失效，Evaluator 在推理前後重新驗證。
- Offer、已提交歷史與發布快照維持不可變。Evaluator 僅排序完整 eligible IDs，未來券／售後權益不会折算成立即價格；本次價格優先的 comparator 不變。權益條款由報告獨立呈現，不交给模型編造價值評分。

## 對話報告

HTML 預設展開每家每輪的 Buyer 要求、Seller 正式回應、單買／組合價格、配件授權狀態與 provider。文字是由當次結構化決策產生的可讀投影，明確標示「非模型逐字稿」。原始模型訊息與私有 prompt 仍留在本地 audit，不直接輸出到公開報告。權益條款與模擬性質在卡片上完整顯示。

## 測試

新增 `tests/tradeoffs.test.mjs` 與 `tests/personas.test.mjs`，覆蓋自主出價、要求回購／服務權益、加贈／折現、不能重複折現、底價、缺貨、失效或跨賣家參考、配件加價授權、五種經濟路徑、假券／假保固、履約證據失效、限時／指定 SKU，以及未來券不當本次折扣。既有隔離、barrier、deadline、預算、重播、immutability 與 Evaluator 排名驗證继续執行。
