## Why

選擇商品後需要根據本輪拒絕紀錄改善購買需求，同時避免把一次選擇誤寫成長期偏好。

## What Changes

- 已實作 Context Builder → Revision Engine → Validation Gate → Revision Committer。
- intent 必保存獨立 ready revision 或 needs_clarification draft；只有明確長期表述才允許 preference patch。
- 使用者確認新增兩條路徑：接受任一方案後，背景改善此前拒絕紀錄；完整非空方案集合全部拒絕後，自動進入改善。
- 共用 v0.3 契約加入可選 selection_version: 1、rejected_offer_ids 與原始 feedback；舊回應不遷移、不補造文字。
- 已接上整合 runtime 的原子決策／工作、進度 API、背景恢復。
- 尚未實作：全域偏好編輯器同步、澄清後提交、ready → child。

## Capabilities

### New Capabilities

- buyer-request-improver: 有依據的本次需求改寫與安全草稿。
- explicit-global-preference-update: 明確長期表述、穩定條目與版本競爭保護。
- improvement-lifecycle: 接受後背景改善、全部拒絕、原子工作與結果恢復。

### Modified Capabilities

無已封存 capability；既有 Result 決策透過可選版本欄位擴充，公開邊界詳見 selection-integration.md。

## Impact

影響共用 schema、OpenAPI、Node 24 runtime 及 SQLite revision/job 儲存。Node 20 legacy backend 保留相容回歸；全應用以 Node 24 runtime 為執行入口。
