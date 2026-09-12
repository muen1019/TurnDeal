## 1. 內部契約與資料前置條件（已實作；證據見 docs/IMPROVER_TEST_REPORT.md）

- [x] 1.1 建立 ImprovementContext、RevisionProposal、ImprovementResult 嚴格 schema 與型別；拒絕 extra fields、壞 evidence IDs 及超長文件。
- [x] 1.2 實作全域偏好正本 repository、revision 與穩定 preference_id 表示層；round-trip 保留無關 Markdown，無法定位時 keep。
- [x] 1.3 建立 additive migrations：工作、intent revisions、全域 preference revisions 與變更稽核；驗證舊資料、decision 與發布快照不變。

## 2. Improver 核心（已實作；支援句型與限制見 docs/BUYER_REQUEST_IMPROVER.md）

- [x] 2.1 實作 Context Builder，驗證 buyer scope、固定拒絕證據與全域版本差異；測試跨 buyer 及價格變更。
- [x] 2.2 實作 deterministic provider 與可選 LLM provider 介面，輸出必填 intent 與 preference keep/patch，模型不具工具權限。
- [x] 2.3 實作 Output Validator 與 diff/evidence 檢查；測試未知欄位、偽引文、重複與衝突 patch。
- [x] 2.4 實作明確長期表述檢查及 scope 驗證；覆蓋全域／品類明示、單次需求、全部拒絕、重複行為與含糊語句。
- [x] 2.5 實作 Intent Semantic Guard 與 Formatter adapter，測試硬條件、加價授權及不支援自然語言；捨棄 patch 後重新驗證 intent。
- [x] 2.6 實作一次修正預算、30 秒 call timeout 與 deterministic fallback；測試 provider 缺失、修正耗盡及文件達上限。
- [x] 2.7 實作可執行改善判定，辨識相同商務組合與單純改寫；資訊不足必回 needs_clarification。

## 3. 工作與版本提交（已實作）

- [x] 3.1 實作 per-parent 唯一工作、90 秒 lease、最多兩次 claim 與持久化模型 attempt count；驗證 stale worker 不可提交。
- [x] 3.2 實作 Revision Committer 原子寫入與結果去重；測試中途 rollback、回應遺失、重啟與 ready/draft 分支。
- [x] 3.3 實作全域版本 CAS、最多一次確定性 rebase；測試無關條目保留、同條目衝突及再次競爭。
- [x] 3.4 建立可重讀內部結果接口及 immutable effective documents，驗證全域後續更新不影響已提交結果。

## 4. 外層整合（selection v1 已接線；後续工作獨立列出）

- [x] 4.1 以 selection_version: 1 擴充接受／全部拒絕提交、unknown-outcome 恢復與狀態查詢；同步 Schema/OpenAPI/fixtures/型別及 OpenSpec，不修改舊保存回應。
- [x] 4.2 定義後端澄清提交與後續 request 契約；驗證 buyer scope、不可變 successor 與重送衝突。前端串接方式見 docs/IMPROVER_BACKEND_INTEGRATION.md，本次不含 UI。
- [ ] 4.5 全域偏好編輯器與一般新對話的權威全域來源同步。
- [x] 4.3 接上原子接受／拒絕＋工作提交 adapter；測試完整非空排名集合、expiry、accept race 及無回饋事件，不捏造 feedback。
- [x] 4.4 接上後端 ready → child workflow，以 durable workflow 去重；驗證 root/parent/revision、交易回滾、重啟恢復及每次拒絕最多一輪。不回填歷史 jobs。

## 5. 驗收與發布（API／hook 已驗證；完整後續循環仍待辦）

- [x] 5.1 執行 deterministic 核心測試及 SQLite 競爭／恢復測試，記錄命令與結果；不需要真實 LLM API 才能驗收。
- [x] 5.2 契約接線後執行 npm run test:contracts、DB 保留資料驗證及 backend typecheck、test、build；使用各自指定 Node 版本。
- [x] 5.4 更新 README 與 owner 現況文件，標出 mock/live 邊界及未交付項目；全部完成前不 archive 本 change。
