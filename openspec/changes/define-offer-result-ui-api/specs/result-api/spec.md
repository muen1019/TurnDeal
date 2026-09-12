## Purpose

接收本輪 intent／preference 快照，提供真正可持久化的 accept／reject API。完整入口 backend/runtime 已串接 Formatter、Discovery、Negotiation、Evaluator；舊 backend/src 的 deterministic mock 僅為相容展示與測試。Buyer Agent 的 Markdown 文件改寫、長期偏好更新、linked child 編排及交易兌換仍不屬於現行服務。

## ADDED Requirements

### Requirement: Preserve document scope and preference provenance
The API SHALL follow docs/INTENT_PREFERENCE_SPEC.md. Both documents SHALL be preserved as request-scoped original text. Omitted preference_md and an explicit empty string currently normalize to empty text; neither clears durable preferences nor prevents Formatter from reading active user_preferences. Explicit preference_md overrides matching attributes for this request only, not the entire durable profile. Current Formatter SHALL produce NormalizedIntent and a persisted formatter_runs snapshot without updating user_preferences or replacing submitted Markdown with generated text.

#### Scenario: Submit temporary preference text
- **WHEN** a buyer submits preference_md or a conflicting same-attribute choice in intent_md
- **THEN** the effective request follows intent_md > preference_md > active SQLite product preferences
- **AND** no durable profile write or Markdown preference revision is performed

#### Scenario: Omit preference text
- **WHEN** preference_md is absent or empty
- **THEN** the request stores an empty preference_md and Formatter can inherit active product preferences
- **AND** the API does not invent a preference_revision_id or claim that a long-term Markdown document was loaded

### Requirement: Distinguish integrated and legacy mock execution
The root integrated runtime SHALL return formatting immediately, then use the existing services for orchestrating, negotiating and evaluating, preserving one request_id and buyer scope. Offline mode SHALL run real deterministic module execution without paid calls; live mode SHALL use server-only credentials with module-level safe fallbacks. The MockResultProvider requirements below apply only to the retained legacy server, not to the integrated execution provider. Both profiles SHALL obey the same document scope, result schema, decision safety and idempotency rules.

### Requirement: Version the changed result contract before implementation
The implementation SHALL use a unified v0.3 successor to the main v0.2 contract and the local Result contract. It SHALL define rejected, RejectDecisionResult and RequestSnapshot.decision as specified in design.md section 2, and update OpenAPI, fixtures and validators together before changing consumers. The current v0.1 artifacts SHALL NOT be described as compatible with this change.

#### Scenario: Prepare integration artifacts
- **WHEN** implementation of the new result lifecycle starts
- **THEN** the shared contract is versioned and all three operations reference it rather than private duplicate DTO definitions
- **AND** old reject=202/superseded examples cannot serve as acceptance fixtures for this service

### Requirement: Create and persist a mock result request
The API SHALL accept POST /api/requests with nonblank intent_md and optional preference_md defaulting to an empty string, with each document limited to 20000 Unicode code points. It SHALL reject malformed JSON, unknown fields and invalid lengths with 400 invalid_request. It SHALL assign IDs and revision on the server, persist original documents and return 202 RequestSnapshot in formatting before scheduling mock generation independently of GET.

#### Scenario: Create a root request
- **WHEN** a valid body and unused Idempotency-Key arrive
- **THEN** revision is 1, root_request_id equals request_id, parent_request_id and next_request_id are null, and offers, ranked_offers and seller_agents are initially empty
- **AND** decision and selected_offer_id are null and no Buyer Agent model is called

### Requirement: Generate deterministic supported combinations
The service SHALL implement MockResultProvider.generate(request_id, revision, documents, clock) using the existing seller and offer fixture data. For the supported baseline it SHALL return five reproducible seller strategies with up to five rounds, including lower price/slower delivery, faster delivery/higher price, a related optional bundle, balanced delivery and firm pricing. It SHALL validate all published offers against trusted fixture data and supported intent constraints, assign new immutable offer IDs per request and label the experience as demo.

#### Scenario: Apply a supported budget and accessory policy
- **WHEN** supported input lowers the budget or forbids accessories
- **THEN** over-budget or forbidden bundles are excluded from eligible rankings, and fewer than six offers are permitted
- **AND** no_match with an error is returned when no compliant offer remains, without silently relaxing the input

#### Scenario: Input cannot be interpreted safely
- **WHEN** an input is outside the documented mock parser cases, incomplete or contradictory
- **THEN** the request becomes needs_clarification with an error, without arbitrary sample cards or a claim of general natural-language understanding

#### Scenario: Repeat a deterministic scenario
- **WHEN** equivalent supported documents are processed with a controlled clock
- **THEN** fixture prices, item combinations and rank policy are reproducible, while each request receives distinct offer IDs and publication-time expiry
- **AND** any up-to-five-round seller history is explicitly simulated fixture history, not evidence of real Seller or Evaluator execution

### Requirement: Read stable snapshots and recover decisions
GET /api/requests/{request_id} SHALL return 200 RequestSnapshot without creating work, reranking, extending expiry or rewriting documents. It SHALL return the persisted decision for accepted and rejected requests and null before a decision. Access SHALL be scoped to the server-derived buyer; missing or foreign resources SHALL return 404 not_found.

#### Scenario: Read a rejected request after reload
- **WHEN** the client reads a request whose reject transaction committed
- **THEN** status is rejected, selected_offer_id and next_request_id are null, documents retain the original revision and decision contains the same RejectDecisionResult returned by POST
- **AND** no new child or rewritten documents are inferred

#### Scenario: All offers have expired
- **WHEN** GET reads an awaiting_user request with expired offers
- **THEN** published data remains unchanged, accept is unavailable and explicit reject is still allowed

### Requirement: Accept exactly one current offer
POST /api/requests/{request_id}/decisions SHALL accept only action=accept and offer_id for an owned awaiting_user request. It SHALL revalidate ranked eligibility, expiry and trusted fixture inventory, price, delivery, items and terms in the decision transaction. Success SHALL return 200 with action, request_id, status=accepted, selected_offer_id and the original expires_at, and persist that result.

#### Scenario: Accept a valid mock offer
- **WHEN** a ranked eligible offer remains valid and no decision has committed
- **THEN** exactly one accepted decision is saved and returned without generating another offer, reserving or decrementing inventory, rewriting intent or performing payment or redemption

#### Scenario: Invalid adoption
- **WHEN** the offer is expired at server time greater than or equal to expires_at, not in buyer/request scope, or no longer eligible/current
- **THEN** the API respectively returns 410 offer_expired, 404 not_found or 409 state_conflict without selecting an alternative

### Requirement: Save rejection as a completed handoff result
POST /api/requests/{request_id}/decisions SHALL accept action=reject and feedback from awaiting_user, needs_confirmation or no_match. Feedback SHALL be nonblank after trimming and at most 2000 Unicode code points as supplied; valid original text SHALL be preserved. Success SHALL atomically persist rejected and return 200 RejectDecisionResult containing action, request_id, status, feedback and source_documents as defined in feedback-loop. It SHALL NOT interpret or rewrite documents or create a child.

#### Scenario: Reject with feedback
- **WHEN** the user submits valid feedback and no decision has committed
- **THEN** the saved source_documents exactly match the request's revision, intent_md and preference_md
- **AND** selection remains null, offers remain immutable and the response contains neither next_request_id nor revised documents

#### Scenario: Vague but syntactically valid feedback
- **WHEN** the user submits nonblank feedback such as 不喜歡
- **THEN** the service records it with 200 and leaves semantic clarification to Buyer Agent, without 422 feedback_requires_clarification or inferred preferences

### Requirement: Persist idempotent mutually exclusive decisions
All POSTs SHALL require a 1–128 character Idempotency-Key scoped to buyer, method and path. A key SHALL bind to a canonical payload. Completed calls SHALL replay the original status and body before checking mutable state or expiry. Mismatched payload SHALL return 409 idempotency_conflict; an in-flight duplicate SHALL return 409 request_in_progress with Retry-After: 1. At most one accept or reject SHALL commit per request regardless of key.

#### Scenario: Accept and reject race
- **WHEN** different decisions race on one request
- **THEN** one transaction wins and the other returns 409 state_conflict, with no partially saved decision

#### Scenario: Retry after response loss or restart
- **WHEN** a committed creation, accept or reject is retried using the original key and body
- **THEN** the original response is replayed without new IDs, changed expiry, repeated business effects or another handoff record

### Requirement: Publish only matching unfinished work and report failures honestly
SQLite SHALL preserve documents, offers, decisions and idempotency results across restarts. Late mock generation SHALL NOT overwrite finalized requests or mismatched revisions. Unfinished generation found after restart SHALL become failed with processing_interrupted. Technical errors SHALL use ErrorResponse with code, message and fields; service failure SHALL NOT be represented as invalid buyer feedback.

#### Scenario: Restart with saved decisions and unfinished generation
- **WHEN** the backend restarts
- **THEN** accepted and rejected records are recoverable unchanged, while interrupted generation is failed and GET does not restart it

#### Scenario: Failure before decision commit
- **WHEN** a transaction or service fails before saving a decision
- **THEN** no partial terminal state or handoff is visible and the response uses internal_error or processing_unavailable as appropriate
