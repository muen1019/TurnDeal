## Purpose

讓使用者在同一個桌面工作區中編輯 Buyer Agent 的購買意圖與偏好、輸入需求，並從可追溯的處理結果進入優惠滑卡與商品明細；切換畫面時維持共同尺寸與操作狀態，避免未儲存設定、未知提交或純粹導覽意外改變購買決策。

## ADDED Requirements

### Requirement: Display request execution progress in the conversation
The Chat UI SHALL expose a reusable AgentProgress component with the shared RequestSnapshot as the authority for final outcomes. The v0.3 RequestSnapshot status enum SHALL remain unchanged. In explicitly enabled development mock mode, GET /__mock/requests/{request_id}/progress SHALL return request_id, a non-negative integer sequence, and stage (formatting, orchestrating, negotiating, evaluating, awaiting_user, failed, needs_clarification, needs_confirmation or no_match). In normal API mode, progress SHALL use the observed RequestSnapshot status without calling a new progress endpoint. The UI SHALL show Formatter, Orchestrator, Negotiation and Evaluation with concise Traditional Chinese descriptions, completed indicators, the current step and pending steps. The UI SHALL NOT advance steps using presentation timers, invent a completion percentage, or expose raw payloads or identifiers.

#### Scenario: Submit and observe the active request
- **WHEN** the user submits a valid request
- **THEN** the active conversation shows a submitting state until creation is acknowledged
- **AND** formatting, orchestrating, negotiating and evaluating progress stages select the corresponding current step with aria-current="step"
- **AND** only preceding steps are marked complete and following steps remain pending
- **AND** the progress panel uses the Chat thread's internal scrolling without pushing the composer outside the viewport

#### Scenario: Receive a result or an interrupted execution
- **WHEN** the active snapshot becomes awaiting_user
- **THEN** the progress panel shows that offers are ready and the existing offer entry is available when the snapshot is verified
- **WHEN** the request fails, needs clarification, needs confirmation or has no match
- **THEN** the panel describes the actual outcome without displaying a successful offer-ready state
- **WHEN** progress polling fails
- **THEN** the panel reports that progress cannot currently be updated and does not invent later completed steps
- **AND** failed or interrupted outcomes without a known failed step do not fabricate completion of earlier steps

#### Scenario: Handle unavailable or stale mock progress
- **WHEN** the mock progress endpoint returns 404
- **THEN** the frontend stops querying that endpoint for this request and falls back to the observed RequestSnapshot status
- **AND** request creation, existing result polling and offer access continue normally
- **WHEN** a progress response has the wrong request_id, an invalid stage or an older sequence
- **THEN** it cannot replace the active request's valid progress
- **WHEN** the progress endpoint finishes before the result snapshot is published
- **THEN** the UI keeps the final processing step until the authoritative result snapshot is received

#### Scenario: Switch conversation or read earlier messages
- **WHEN** the user switches to another conversation
- **THEN** submitting and processing indicators belong only to that conversation's request
- **WHEN** a new step arrives while the user is near the bottom of the thread
- **THEN** the thread follows the new progress content
- **WHEN** the user has scrolled upward to read earlier messages
- **THEN** a progress update does not force the thread back to the bottom

#### Scenario: Read progress with assistive technology
- **WHEN** the current step changes
- **THEN** its concise status is announced politely without repeatedly announcing the entire step list
- **AND** status is distinguished by text and icons as well as color
- **AND** updates use no movement animation, including under prefers-reduced-motion

### Requirement: Provide an opt-in HTTP mock for request progress
The frontend development environment SHALL offer an explicitly enabled mock API using the active shared contract and deterministic fixtures. Normal development and production SHALL continue to use their configured real API. The mock progress endpoint SHALL return server-controlled progression through formatting, orchestrating, negotiating and evaluating before publishing the result, and SHALL support an interrupted-outcome scenario for verification. Mock RequestSnapshot responses SHALL retain formatting until a valid terminal or awaiting_user snapshot can be returned.

#### Scenario: Exercise the progress UI without an Agent backend
- **WHEN** the frontend starts in its documented mock mode and a valid request is submitted through Chat
- **THEN** POST request creation and subsequent GET snapshots are served over HTTP by the mock
- **AND** one-second mock progress polling drives a reusable UI interface alongside existing result snapshot polling
- **AND** snapshots validate against the active shared contract and remain scoped to their request
- **AND** a visible demonstration indicator identifies the simulated run

#### Scenario: Start without the mock switch
- **WHEN** the frontend starts normally or is built for production
- **THEN** the mock does not intercept API traffic or silently replace failed backend requests
- **AND** the progress client does not request /__mock or introduce a new /api progress route
- **AND** detailed real Agent progress remains a future data-source integration; only observed snapshot states are displayed in normal mode

### Requirement: Share one responsive application shell
The UI SHALL use one persistent AppShell, WorkspaceHeader and AgentSidebar for Chat, agent definitions, offers and offer details, using the exact full-bleed breakpoints and geometry in design.md section 10. Only the main-content view SHALL change during navigation, and page-level document scrolling SHALL remain disabled.

#### Scenario: Display the desktop Chat workspace
- **WHEN** the viewport is at least 1200px wide
- **THEN** the shell width is 100vw, its height follows visualViewport height when available and otherwise 100dvh, with zero page margin, border and radius, a 64px header and 240px sidebar
- **AND** the main slot contains a flexible conversation column and a 360px definition editor separated by 16px, with 24px workspace padding
- **AND** opening offers replaces both columns within the same main slot without changing the shell bounds or exposing body scrolling

#### Scenario: Adapt the whole workspace together
- **WHEN** the viewport changes to 768–1199px or 320–767px width
- **THEN** Chat, offers and details all use the corresponding shared layout from design.md section 10
- **AND** the editor is reachable through 代理設定 as a main view rather than compressing the conversation into an unreadable column
- **AND** text enlargement, long content and the software keyboard preserve reachable controls through internal Chat/editor/detail scrolling, with no page-level horizontal or vertical overflow

### Requirement: Edit only supported buyer definition documents
The UI SHALL expose editable intent.md and preference.md, mapped to the shared contract's intent_md and preference_md. It SHALL distinguish local drafts from saved definitions and SHALL NOT treat editing as a mutation of a published request or filesystem file.

#### Scenario: Edit and save a valid definition
- **WHEN** the user changes intent.md or preference.md and activates 儲存設定
- **THEN** the editor validates nonempty intent and the shared 20000-code-point maximum for each document, allowing an empty preference
- **AND** saving succeeds only after both saved texts and a local version have been stored atomically by the definition repository
- **AND** the UI displays 已儲存於此分頁 and 儲存後套用於下一次需求, without changing existing offers or requests

#### Scenario: Cancel or fail a save
- **WHEN** the user activates 取消變更 or storage fails while saving
- **THEN** cancellation restores the last saved definitions, while failure preserves the edited draft and displays an inline error without marking it saved
- **AND** a new requirement cannot be sent while the saved definition version is still being written

#### Scenario: Preserve drafts across navigation and reload
- **WHEN** a user switches to offers and back or reloads the same tab
- **THEN** buyer-scoped definition drafts, saved versions and unsent requirement text are restored from session storage
- **AND** storage failure is reported visibly without claiming persistence, and unavailable local history is not fabricated from a backend snapshot
- **AND** document text is never encoded into navigation URLs

### Requirement: Submit explicit text with a saved definition snapshot
The UI SHALL accept a trimmed nonempty requirement of at most 2000 Unicode code points and compose it with the saved buyer definitions using the deterministic mapping in design.md section 11. It SHALL use the existing CreateRequest contract and SHALL NOT send additional unrecognized fields.

#### Scenario: Submit a new requirement
- **WHEN** the user sends a valid requirement from a new conversation with valid saved definitions
- **THEN** the frontend snapshots the saved definition version and exact text, forms intent_md as saved intent plus two newlines, ## 本次購買需求, one newline and the requirement text, and preserves preference_md unchanged
- **AND** it validates the composed documents against the shared contract before POST /api/requests with an idempotency key
- **AND** it sends no conversation_id, definition_version, filename or separate message field in that request body

#### Scenario: Send while definitions have unsaved changes
- **WHEN** the editor is dirty and an older valid saved definition exists
- **THEN** the send area clearly states that unsaved changes will not be used, and sending uses only the saved version
- **AND** if there is no valid saved intent, sending is disabled with a direct path to the required editor field
- **AND** invalid or oversized composed content preserves all drafts and sends no request

#### Scenario: Type Chinese and multiline requirements
- **WHEN** the user presses Enter during IME composition or Shift+Enter in the composer
- **THEN** no requirement is sent, with Shift+Enter inserting a newline
- **AND** Enter outside composition or activating the labeled send button submits exactly once when validation permits

### Requirement: Recover request creation without duplicating work
The UI SHALL persist the creation idempotency key and exact body before dispatch, lock duplicate sends while unresolved and reconcile using the same key and body. A view change SHALL NOT create another request or imply cancellation of an in-flight operation.

#### Scenario: Double submit or reload before creation responds
- **WHEN** the user presses Enter twice, clicks send repeatedly or reloads after the POST may have reached the server
- **THEN** only one creation identity is used and retry preserves its original key and body
- **AND** the composer retains the sent content for recovery without allowing a conflicting resubmission

#### Scenario: Handle a failed or unknown creation result
- **WHEN** creation returns a definite validation error or its outcome is unknown
- **THEN** a definite error restores the editable draft with its message, while an unknown result remains locked and retryable with the original key
- **AND** an unavailable local journal is reported as unrecoverable locally rather than claiming that the server cancelled the request

### Requirement: Show verifiable processing and an explicit offer entry
The UI SHALL derive processing and result messages from validated RequestSnapshot data, use existing polling limits, and display an explicit 查看 N 組優惠 entry only for eligible results. It SHALL NOT auto-navigate or auto-accept when a result arrives.

#### Scenario: Receive a completed comparison
- **WHEN** polling returns awaiting_user with a valid ranked offer collection
- **THEN** Chat presents the correct offer count and an optional lowest total computed from those offers, with a 查看優惠 action tied to that request_id
- **AND** seller and round completion claims reflect actual returned history rather than fixed success copy
- **AND** activating the action opens /requests/{request_id} inside the same shell without a decision POST

#### Scenario: Display a non-actionable result or demo pipeline
- **WHEN** the snapshot is processing, no_match, needs_clarification, needs_confirmation or failed
- **THEN** Chat displays the corresponding status and permitted action without an adoptable result teaser for unauthorized offers
- **AND** deterministic or unavailable AI integration is clearly identified rather than presenting fabricated model messages or negotiation completion

### Requirement: Preserve navigation and distinguish feedback from a new purchase
The UI SHALL retain request identity, pending journals, the offer deck and drafts when switching between Chat and offers. Revising an awaiting_user round SHALL use the existing explicit feedback workflow; navigation and definition editing SHALL NOT count as rejection or acceptance.

#### Scenario: Return to an existing conversation
- **WHEN** the user activates 返回對話 from offers or details
- **THEN** /chat?request_id={request_id} shows the associated local conversation and unsent draft without a POST, preserving current card and skip state for the next visit
- **AND** if the local history is unavailable, it shows only the verified request snapshot with 本分頁沒有原對話紀錄
- **AND** a pending decision remains locked and continues reconciliation in the background

#### Scenario: Submit changes to the current round
- **WHEN** the user chooses 補充需求 for an awaiting_user result
- **THEN** the confirmed text is submitted with the explicit label 送出回饋 through the existing reject API
- **AND** 200 success shows rejected with a saved user feedback summary while keeping source_documents hidden in presentation, and 400 validation errors retain the original round and draft
- **AND** the UI does not create a child or claim Agent delivery or rewriting; absent an external integration it displays 回饋已保存，Buyer Agent 尚未接入
- **AND** processing or unresolved submission states permit draft editing but not a competing decision; a completed round requires 新對話 to start a new root purchase

### Requirement: Make workspace transitions accessible and interruptible
The UI SHALL use M7 for Chat, offers and editor navigation and M6 for offer details as defined in design.md. It SHALL retain the shell geometry throughout every transition and SHALL preserve business state independently of animation progress.

#### Scenario: Navigate with pointer or keyboard
- **WHEN** pointer navigation changes Chat, offers or editor view
- **THEN** only entering main content fades from opacity 0 to 1 over 160ms ease-out with zero delay, while exiting content stops receiving input immediately
- **AND** keyboard navigation and details changes use 0ms animation, and reduced-motion navigation uses opacity only with no translation, scaling or shell resize
- **AND** focus moves to the destination heading or editor, and returning restores the originating control when available

#### Scenario: Interrupt navigation or receive a late response
- **WHEN** navigation repeats, reduced-motion changes or an API result arrives halfway through M7
- **THEN** the newest view wins, obsolete visual callbacks are cancelled and a late response updates only its matching request scope
- **AND** no animation completion can send a purchase, discard a draft, unlock an unresolved decision or restore an obsolete view
- **AND** switching motion preference does not restart completed transitions

#### Scenario: Measure shell equality during transitions
- **WHEN** Chat, offers and details are sampled at 0, 50 and 100 percent of a transition on the same viewport and accessibility setting
- **THEN** shell, header, sidebar and main-slot bounding boxes differ by no more than 1 CSS pixel
- **AND** acceptance evidence includes 1536 by 1024 desktop comparison plus the existing 320, 390, 768 and 1440px responsive checks, without treating generated concept images as runtime evidence


### Requirement: Hide technical API data from presentation
The UI SHALL NOT render technical or debugging identifiers and payloads in Chat, definition, result, feedback, detail, accepted, rejected or negotiation views. This presentation rule SHALL NOT remove API v0.3 source_documents, decision or identifier fields from validated data, storage or integration handoff.

#### Scenario: Review user-visible text
- **WHEN** any Chat or Buyer Agent view is displayed
- **THEN** the visible UI contains no request_id, offer_id, product_id, terms_id, campaign_id, raw JSON, decision payload or source_documents content
- **AND** it still displays user-relevant saved feedback summaries, processing status, seller names, offer counts and the explicitly requested intent.md and preference.md editor
