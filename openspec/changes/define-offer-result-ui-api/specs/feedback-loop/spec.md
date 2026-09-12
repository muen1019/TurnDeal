## Purpose

Result backend 保存明示決策並提供 Buyer Agent 改寫所需的原始文件及回饋。此 capability 的交付終點是可重播、可恢復的 handoff 資料，不包含模型改寫或下一輪建立。

## ADDED Requirements

### Requirement: Return original documents with explicit rejection
The Result API SHALL return 200 RejectDecisionResult with exactly action=reject, request_id, status=rejected, feedback and source_documents. source_documents SHALL contain revision, intent_md and preference_md copied from the immutable request documents. The response SHALL represent a saved decision, not a completed rewrite.

#### Scenario: Reject a bundle and lower the budget
- **WHEN** the user submits 不要滑鼠墊，預算改成 800 元，其他條件不變
- **THEN** the response preserves that feedback and the original documents at their original revision
- **AND** it does not return a rewritten 800-TWD intent, increment revision or issue next_request_id

### Requirement: Keep interpretation with Buyer Agent
Buyer Agent or its integration owner SHALL be responsible for semantic clarification and any later rewrite. The Result backend SHALL perform only feedback shape and length validation and SHALL NOT infer budget changes, paid-addon consent, product preferences or seller blacklists from accept, reject or local skips.

#### Scenario: Preserve ambiguous feedback for clarification
- **WHEN** feedback says only 不喜歡
- **THEN** the API records it without guessing the reason, and Buyer Agent may request clarification after receiving the handoff
- **AND** the original round remains rejected while that external clarification is pending

#### Scenario: An accepted gift is not a permanent preference
- **WHEN** the user accepts an offer containing an accessory
- **THEN** the accepted result identifies the selected offer only and does not change current documents or long-term buyer preferences

### Requirement: Separate API response from Agent invocation
The caller/integration owner SHALL consume the decision response or recover it through GET RequestSnapshot.decision before explicitly handing it to Buyer Agent. This service SHALL NOT introduce a webhook, queue, model call or automatic Agent invocation. Client messaging SHALL distinguish saved feedback from delivery to an Agent and from completed rewriting.

#### Scenario: Buyer Agent is not connected
- **WHEN** reject succeeds with no configured external integration
- **THEN** the UI displays 回饋已保存，Buyer Agent 尚未接入 and allows viewing the saved handoff data
- **AND** it does not claim Agent delivery, intent rewriting, new-round processing or a new request ID

#### Scenario: External handoff fails after persistence
- **WHEN** the caller fails to deliver a saved decision to Buyer Agent
- **THEN** the decision remains rejected and recoverable by GET; the caller may retry external delivery without resubmitting a different decision
- **AND** the integration owner deduplicates delivery by the immutable request_id and decision, without claiming exactly-once Agent execution from HTTP idempotency alone

### Requirement: Defer linked follow-up creation to a separate integration contract
The Result service SHALL NOT automatically create or link a child request after rejection. Parent linkage, document revision advancement and submission of Buyer Agent rewritten documents SHALL require a separate versioned integration contract before being implemented. POST /api/requests in this scope SHALL create independent roots only.

#### Scenario: A rewritten intent becomes available externally
- **WHEN** Buyer Agent finishes a rewrite
- **THEN** this service does not claim that a linked next round exists; linkage and submission await the external integration contract
- **AND** an explicitly started new conversation may create an independent root, but it is not presented as the rejected request's child or revision 2

### Requirement: Keep persisted handoff recoverable and scoped
The backend SHALL save the decision and its original documents atomically with rejected state, replay successful POST responses and expose the same decision through buyer-scoped GET. No browser or API component SHALL claim to have written local intent.md or preference.md files.

#### Scenario: Response lost after commit
- **WHEN** the reject response is lost and the browser reloads
- **THEN** GET returns the saved feedback and source_documents, or the original POST key replays the same result
- **AND** no rewrite, child or second decision is needed for recovery
