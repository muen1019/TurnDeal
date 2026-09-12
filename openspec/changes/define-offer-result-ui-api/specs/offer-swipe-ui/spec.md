## Purpose

讓買家在已排序且可追溯的優惠方案中，以滑動或等價按鈕選擇一個方案，並對不合適的整輪結果提供明示回饋，同時正確呈現服務端狀態、到期限制與未知的提交結果。

## ADDED Requirements

### Requirement: Display ranked offer cards
The UI SHALL render validated result data in ascending rank order, with one complete offer per card, and SHALL preserve backend prices, item quantities, reasons, tradeoffs and expiry. Backend identifiers remain in data for validation and callbacks but SHALL NOT be rendered as technical UI.

#### Scenario: Adapt a shared snapshot
- **WHEN** the API returns the shared RequestSnapshot
- **THEN** the frontend joins ranked_offers.offer_id to offers and seller_id to seller_agents to produce its local ResultView
- **AND** missing referenced IDs block decisions rather than causing invented or omitted offers

#### Scenario: Render the initial two offers
- **WHEN** an awaiting_user result contains ranks 1 and 2 priced at TWD 780 and 800
- **THEN** the UI displays rank 1 first with seller, primary item and optional accessory in the combination name, tax-and-shipping-inclusive total, delivery days, concise expiry and a details action
- **AND** the complete item list, recommendation reason and tradeoffs remain accessible in OfferDetails for the same offer
- **AND** absent product images use neutral placeholders rather than invented product images or ratings

#### Scenario: Invalid result cannot be accepted
- **WHEN** IDs are duplicated, ranks are non-contiguous, required fields are missing, or includes_tax_and_shipping is false
- **THEN** the UI displays a data error and disables decisions without silently removing malformed offers

### Requirement: Right swipe immediately accepts one offer
The UI SHALL immediately submit an accept decision for the current unexpired offer upon a committed right swipe or activation of the accept button, without a shortlist or second confirmation dialog.

#### Scenario: Commit a right swipe
- **WHEN** the pointer is released after moving right at least 25 percent of card width and horizontal movement exceeds vertical movement
- **THEN** the UI submits the current offer_id once, locks both accept and reject operations, and displays a pending state without activating the next card
- **AND** HTTP 200 accepted ends the round and displays the selected offer as accepted but not redeemed or paid

#### Scenario: Incomplete drag does not submit
- **WHEN** the pointer is released below the threshold or cancelled
- **THEN** the card returns to its position and no decision request is sent

### Requirement: Left swipe is a reversible local skip
The UI SHALL treat a committed left swipe or skip button as a local skip, SHALL permit undo of the latest skip before submission, and SHALL NOT infer changed requirements from a skip.

#### Scenario: Skip then undo
- **WHEN** a user skips the current card and activates undo before sending a decision
- **THEN** the previous card and skip state are restored with no POST request or document revision

#### Scenario: Every offer is skipped
- **WHEN** the user skips the final card
- **THEN** the UI displays the feedback form and a review-again action
- **AND** it does not automatically reject the round or create another request

### Requirement: Explicit round feedback
The UI SHALL allow the user to edit and submit nonempty feedback of at most 2000 Unicode code points before rejecting a round. Optional skip reasons SHALL remain local until the user confirms the resulting feedback text.

#### Scenario: Submit useful feedback
- **WHEN** the user submits a confirmed change such as excluding accessories
- **THEN** the UI sends action=reject with feedback only and no swipe_history, replacement prices or entire offer array

#### Scenario: Feedback fails input validation
- **WHEN** the API returns HTTP 400 invalid_request for blank or oversized feedback
- **THEN** the UI preserves the same round, skipped cards and draft feedback and displays the field message for correction

### Requirement: Prevent conflicting submissions and reconcile uncertainty
The UI SHALL preserve a pending decision's request_id, idempotency key and exact body across reloads in the same tab, and SHALL prevent an opposite or different decision until the pending result is resolved.

#### Scenario: Timeout after possible server commit
- **WHEN** the decision request times out or the page reloads during submission
- **THEN** the UI retrieves the server result or retries with the original key and body
- **AND** it never interprets an awaiting_user GET alone as proof that the in-flight POST failed

#### Scenario: Double gesture while submitting
- **WHEN** another swipe or button click occurs during submission
- **THEN** no second decision or new idempotency key is created

### Requirement: Follow server lifecycle and expiry
The UI SHALL poll processing states no faster than once per second with no overlapping GETs, stop on terminal/user-action states, and ignore responses belonging to a previous request. It SHALL disable adoption of expired offers and SHALL NOT extend expiry locally.

#### Scenario: Rejected round returns a saved handoff
- **WHEN** reject returns 200 with status=rejected, feedback and source_documents
- **THEN** the UI stops decisions and polling, displays a user-facing saved feedback summary, hides source_documents from presentation, and retains the request identity for recovery
- **AND** it neither creates nor follows a child, and displays 回饋已保存，Buyer Agent 尚未接入 when no external integration is connected

#### Scenario: Offer expires before adoption
- **WHEN** local time reaches expires_at or the server returns HTTP 410
- **THEN** the UI marks the offer expired, disables adoption, and permits reviewing other offers without automatically accepting one

#### Scenario: No match or service failure
- **WHEN** the API returns no_match, needs_clarification, needs_confirmation or failed
- **THEN** polling stops and the UI displays the corresponding reason and permitted next action without showing unauthorized adoptable cards

### Requirement: Accessible equivalent interactions
The UI SHALL provide labeled buttons, keyboard operation, visible focus, readable card details and reduced-motion behavior equivalent to swipe controls, and SHALL explain that right swipe immediately accepts.

#### Scenario: Keyboard-only user
- **WHEN** the user navigates with Tab and activates skip or accept with Enter or Space
- **THEN** the same state transition and API behavior occur as for the corresponding swipe
- **AND** the transition and its asynchronous result use no animation, while focus remains visible

#### Scenario: Read long details on a phone
- **WHEN** recommendation text overflows a narrow screen
- **THEN** the user can open OfferDetails and expand or scroll its content without triggering a swipe and can still reach the action controls

### Requirement: Show negotiation context separately from recommendation
The UI SHALL expose seller status and both negotiation rounds from the shared snapshot, and SHALL display Sponsored as a separate labeled placement without changing offer rank or implying that sponsorship improves evaluation.

#### Scenario: Three-seller demo
- **WHEN** the shared happy-path fixture is displayed
- **THEN** the user can inspect final offers from the selected sellers while the offer deck follows the published fixture ranking; round summaries and negotiation-history UI are not displayed
- **AND** Sponsored is rendered only from sponsored_placement and is absent when that field is null

### Requirement: Apply the reference visual system consistently
The UI SHALL use the exact semantic color, radius, spacing, typography and shadow tokens in design.md section 8 and the shared workspace geometry in section 10. It SHALL use the approved Chat and simplified offer designs as visual direction while preserving the offer-selection product semantics.

#### Scenario: Inspect the result view styling
- **WHEN** an awaiting_user result is displayed
- **THEN** the body and shared shell form a full-bleed #E8F1F8 background, the primary card is #FFFFFF, supporting surfaces are #F5F8FC, and primary buttons use #252A28 with white text
- **AND** panel, card, media and control radii are respectively 32px, 24px, 20px and 16px, with spacing and typography matching the token table
- **AND** only raised surfaces use the shared 0 8px 24px rgba(37, 42, 40, 0.08) shadow without stacked decorative shadows

#### Scenario: Distinguish semantic states accessibly
- **WHEN** pending, expired, accepted, rejected or error is displayed
- **THEN** a visible text label identifies the state independently of color
- **AND** text contrast is at least 4.5:1 and actionable icons, necessary control boundaries and focus indicators have at least 3:1 contrast against adjacent backgrounds
- **AND** disabling adoption does not fade the entire card or obscure the price, terms or expiry

### Requirement: Reuse components without introducing new commerce actions
The UI SHALL share the Surface, Button, IconButton, StatusPill, StatusMessage, ItemRow, PriceBlock, OfferMedia and FormField presentation contracts in design.md section 8 across result, feedback, negotiation and decision-summary views. These are frontend presentation components and SHALL NOT introduce new API fields or mutate offers.

#### Scenario: Compare an offer with its accepted summary
- **WHEN** the same offer appears before and after acceptance
- **THEN** item rows, total-price typography, spacing and status styles use the same component variants
- **AND** only the original read-only items and quantities are displayed without cart, quantity editing or bookmark controls
- **AND** Sponsored remains a separately labeled neutral placement and does not use a recommendation or success badge

#### Scenario: Render absent or failed product imagery
- **WHEN** no trusted catalog image is available or loading that image fails
- **THEN** OfferMedia retains its 4:3 aspect ratio and 20px radius and shows a neutral placeholder with the label 商品示意
- **AND** a trusted image, when present, fits within the reserved area without cropping the product, shifting action controls or inventing attributes

### Requirement: Preserve readable responsive layout and reachable controls
The UI SHALL implement the full-bleed viewport, internal-scroll and safe-area rules in design.md sections 8 and 10. It SHALL retain readable offer terms and equivalent controls when content grows or the viewport changes without relying on body/document scrolling.

#### Scenario: Review on phone and desktop widths
- **WHEN** the result is rendered at 320px or 390px width
- **THEN** it uses one column inside a 100vw by visualViewport/100dvh shell with zero page margins, 16px card padding and no page-level horizontal or vertical overflow
- **AND** at 768px the shell remains full-bleed, uses a 72px navigation rail and a maximum 480px single-column offer card inside the internally scrolling main slot
- **AND** at 1440px it remains full-bleed with a 240px sidebar and a maximum 640px card with media and information in two columns
- **AND** mobile ordering is summary, seller overview, offer, actions, negotiation entry and Sponsored, with full item content available through details

#### Scenario: Read enlarged text with an open software keyboard
- **WHEN** text is enlarged to 200 percent or the feedback field opens the software keyboard
- **THEN** text wraps without clipping and all details and controls remain reachable through internal view scrolling rather than body/document scrolling
- **AND** a sticky action region reserves its own height and safe-area space or falls back to normal flow if it would obscure content or focus
- **AND** every action target is at least 44 by 44 CSS pixels, with standard buttons 48px high

#### Scenario: Read details without moving the workspace
- **WHEN** the user opens OfferDetails or expands or collapses reasons or tradeoffs within it
- **THEN** the main content or inline content updates immediately using M6 with no animation or modal, and the shared shell retains its geometry
- **AND** reading, selecting text and scrolling the expanded content never initiate a card swipe

### Requirement: Recognize deliberate pointer gestures
The UI SHALL apply M2 from design.md section 9 only to eligible non-interactive card regions. Both swipe directions SHALL commit only on release at a final absolute horizontal displacement of at least 25 percent of the pointerdown card width, with absolute horizontal movement greater than vertical movement. Velocity SHALL NOT substitute for displacement.

#### Scenario: Acquire horizontal intent
- **WHEN** the original pointer moves at least 8px horizontally and absolute horizontal movement exceeds vertical movement
- **THEN** the deck captures that pointer and directly tracks its displacement with zero transition duration and no rotation
- **AND** displacement beyond one card width adds only 0.25 times the excess displacement to the visual transform, without changing the raw commit distance
- **AND** a gesture that starts on a control, link, field or selectable expanded text does not acquire card dragging

#### Scenario: Cross the threshold and then reverse
- **WHEN** the pointer crosses the right threshold but is released back within it, or makes a fast flick below 25 percent of card width
- **THEN** no accept request is sent and M3 returns the card to center
- **AND** the release direction and final displacement determine the action, not the maximum distance or speed reached earlier
- **AND** both motion modes show the appropriate 放開以採用 or 放開以略過 label only while the current displacement meets the corresponding commit threshold

#### Scenario: Preserve vertical scrolling and original pointer ownership
- **WHEN** the user scrolls vertically or adds a second touch during a card gesture
- **THEN** native vertical scrolling remains available and browser pointer cancellation sends no decision
- **AND** additional pointers neither replace the active pointer, change its displacement nor trigger another action

### Requirement: Use defined motion for local navigation and feedback
The UI SHALL implement motion profiles M1 through M6 in design.md section 9, with zero delay and shared ease-out cubic-bezier(0.23, 1, 0.32, 1). The UI SHALL animate only transform and opacity for these profiles and SHALL keep visual progress separate from logical state changes.

#### Scenario: Press and release an enabled action
- **WHEN** an enabled button receives pointerdown followed by release or cancellation
- **THEN** M1 targets scale 0.97 and then 1 with 160ms ease-out for each transition, retargeting from the current transform if interrupted
- **AND** pending or disabled controls reset to scale 1 and never activate a duplicate operation
- **AND** hover feedback is available only for hover-capable fine pointers and focus styling appears immediately

#### Scenario: Return an uncommitted card
- **WHEN** a drag ends without a committed action while normal motion is enabled
- **THEN** M3 targets translateX 0 using a spring configured with duration 0.5 seconds and bounce 0.2, retaining current position and velocity
- **AND** the offer remains readable at opacity 1 throughout the return

#### Scenario: Skip a card and reveal the next offer
- **WHEN** a left swipe or pointer-activated skip button commits a local skip
- **THEN** the skipped ID changes immediately and M4 moves the old card from its current position to -1.2 times its width while fading to zero over 200ms ease-out
- **AND** the next card simultaneously transitions from translateY 8px, scale 0.97 and opacity 0 to its resting transform and opacity 1 over 200ms
- **AND** no API call, delayed index change or animation-completion dependency is introduced
- **AND** if the last offer was skipped, the feedback form instead enters with M5 opacity 0 to 1 over 160ms

#### Scenario: Repeat polling and receive a changed status
- **WHEN** a GET returns the same status and content
- **THEN** no entrance, pulse, shimmer, rotation or stagger animation restarts
- **AND** newly changed status content uses M5 opacity 0 to 1 over 160ms without fading out unchanged price or terms
- **AND** pending indicators use a static icon and text rather than a continuous animation

### Requirement: Separate submission timing from visual completion
The UI SHALL lock decisions, preserve the pending journal and dispatch the authorized request as part of the committed input action, without waiting for an animation callback. It SHALL show a saved accepted or rejected decision only after a successful response or authoritative reconciliation.

#### Scenario: Submit while the dragged card returns
- **WHEN** a valid right swipe is released
- **THEN** one accept request is dispatched immediately after pending state is saved, while the selected card uses M3 to return to center and displays 採用中
- **AND** the next card is not made actionable and the selected card does not exit as if acceptance had succeeded
- **AND** pausing or disabling all animations does not prevent request dispatch or completion

#### Scenario: Receive acceptance before the spring completes
- **WHEN** HTTP 200 accepted arrives while M3 is still active
- **THEN** the UI immediately records accepted, settles the selected card to center and displays the accepted status and saved selection summary with M5
- **AND** any old animation callback cannot unlock acceptance, advance the deck or send a redemption request

#### Scenario: Show uncertainty or recover from a failure
- **WHEN** a response is lost or a confirmed failure arrives during an animation
- **THEN** an unknown result retains the same offer, journal and decision lock in reconciling with 確認結果中
- **AND** a failure proven to have no side effect restores the permitted state with the same offer or feedback draft and an inline error
- **AND** expired or conflicting results follow the existing server lifecycle rules instead of restoring unauthorized adoption

### Requirement: Resolve interruptions against current logical state
The UI SHALL make animations interruptible and SHALL treat business state, expiry and request identity as authoritative over visual progress. Leaving elements SHALL be non-interactive, excluded from keyboard focus and hidden from assistive technology.

#### Scenario: Undo or skip again during an exit
- **WHEN** undo or a further eligible local skip occurs at any point during M4
- **THEN** the event is applied once to the current logical deck without waiting for the previous animation
- **AND** undo retargets the same previous offer from its current visual position, or from -1.2 card widths and opacity 0 if already unmounted, to center and opacity 1 over 200ms
- **AND** rapid skips retain at most one leaving visual layer, do not queue animations and do not duplicate an offer in the accessible deck

#### Scenario: Re-grab a returning card
- **WHEN** an eligible card receives a new deliberate drag during M3
- **THEN** dragging continues from its current displayed position without a jump and preserves spring velocity when it next settles
- **AND** commit distance counts only displacement since the new pointerdown, so residual transform cannot accidentally satisfy the accept threshold

#### Scenario: Cancel an unsubmitted gesture
- **WHEN** Escape, pointercancel or unexpected capture loss occurs before commit
- **THEN** the card returns through M3 with no decision request, with Escape using an immediate zero-duration return
- **AND** window blur, hidden-page transition, orientation change or card-width change instead cancels the gesture and restores the card immediately
- **AND** normal capture release following an already-handled pointerup does not reverse that committed action

#### Scenario: Expire or replace the request mid-gesture
- **WHEN** expiry, authoritative accepted or rejected state, or a request_id change arrives during dragging or leaving
- **THEN** the UI cancels the obsolete gesture and visual callbacks and immediately applies the authoritative state
- **AND** a later pointerup or animationend for the old card cannot adopt it, change a new deck or unlock a pending request
- **AND** cancellation of visual work never clears an unresolved POST journal or claims that the server cancelled the operation

### Requirement: Honor reduced motion and keyboard input throughout a transition
The UI SHALL apply the reduced-motion column of M1 through M6 when prefers-reduced-motion is reduce, including on first render and when the preference changes at runtime. Keyboard-triggered actions and their asynchronous outcomes SHALL use zero-duration visual transitions regardless of the motion preference.

#### Scenario: Swipe with reduced motion already enabled
- **WHEN** the user drags a card with reduced motion enabled
- **THEN** the card remains centered without translation, rotation, scaling or spring overshoot
- **AND** the same raw displacement and release thresholds apply with a static 放開以採用 or 放開以略過 label when the corresponding threshold is met
- **AND** local replacement and new status content use only the defined 160ms opacity transition; adoption still submits immediately

#### Scenario: Change motion preference during dragging or animation
- **WHEN** prefers-reduced-motion changes to reduce during an active gesture or transition
- **THEN** all spatial motion stops immediately and cards settle at the position implied by current logical state
- **AND** the active pointer's raw displacement and any pending request are preserved without automatically committing or cancelling the business action
- **AND** switching back does not replay finished motion or add movement to that active gesture; spatial motion resumes only for a new action

#### Scenario: Keep keyboard feedback and focus immediate
- **WHEN** a keyboard action skips, undoes, expands, accepts or rejects
- **THEN** every associated state transition, including its later success or error, uses 0ms animation and presents visible focus immediately
- **AND** focus stays on a surviving control; if it is removed, focus moves to the next offer heading, feedback heading, accepted heading or rejected heading appropriate to the new state
- **AND** polling does not steal focus, pending state is announced once, and new success or error messages are announced without repeated per-frame or per-poll announcements

### Requirement: Verify visual and motion behavior with observable evidence
The UI SHALL be accepted against the exact token and motion tables and the interruption cases in design.md sections 8 through 11, in addition to the existing API and interaction checks.

#### Scenario: Inspect parameters and interrupt at different progress points
- **WHEN** implementation acceptance is performed with a controlled clock and delayed API responses
- **THEN** configured durations, curves, spring values, colors and radii equal the specified values, and stable transform endpoints are within 1 CSS pixel and opacity within 0.01
- **AND** rapid skip/undo, accept success, expiry and request replacement are injected at 0, 50 and 100 percent of visual progress without changing the required API call counts or logical result
- **AND** timing assertions allow one rendering frame of scheduling tolerance and do not equate dropped frames with different configured parameters

#### Scenario: Check real input modes and responsive presentation
- **WHEN** the implemented UI is reviewed for acceptance
- **THEN** evidence covers 320px, 390px, 768px and 1440px viewports, full-bleed shell bounds, absence of body x/y scroll, internal content scrolling, text enlargement to 200 percent, touch scrolling, keyboard focus and reduced-motion initial and runtime behavior
- **AND** unavailable device checks are reported as unverified instead of treating specification validation as a visual or runtime pass

### Requirement: Keep the swipe workspace the same size as Chat
The UI SHALL render offers, feedback, details and accepted or rejected results inside the same persistent AppShell used by Chat. At an unchanged viewport and accessibility setting, the shell, header, sidebar and main-content slot SHALL retain their bounding boxes within 1 CSS pixel during and after navigation and gesture transitions.

#### Scenario: Open desktop offers from Chat
- **WHEN** the user activates 查看優惠 from a ready Chat at 1536 by 1024 CSS pixels
- **THEN** the AppShell remains 1536px wide and 1024px high with zero margin, border and radius, a 64px header and a 240px sidebar
- **AND** the offers workspace uses the full main-content slot previously occupied by chat and editor without retaining a blank editor column or creating a phone-width outer frame
- **AND** the card alone is centered at a maximum width of 640px, with its own responsive image and information columns

#### Scenario: Drag without moving application chrome
- **WHEN** the current 640px card reaches a raw horizontal displacement of 160px with horizontal dominance
- **THEN** its 25 percent release threshold is met, while the shell, header, sidebar, workspace heading, feedback background and action row remain stationary
- **AND** a left drag reveals the right-side blue region with 放開以略過, while a right drag reveals the left-side green region with 放開以採用
- **AND** only the card transform changes and overflow is clipped by the deck rather than overlapping navigation

### Requirement: Keep the main offer card concise and truthful
The UI SHALL limit the main card to product imagery, seller, combination name, total including tax and shipping, delivery, concise expiry, at most one supported offer label and a details action. Detailed item rows, full terms, recommendation reasons and tradeoffs SHALL remain accessible without altering the snapshot.

#### Scenario: Render a simplified combination
- **WHEN** a valid offer includes a primary mouse and one accessory
- **THEN** both items are represented by the combination name and image or neutral placeholder, while the card emphasizes the backend total and delivery
- **AND** no original price, discount percentage or free-gift claim is fabricated when the trusted input does not support it
- **AND** the deck shows the original rank and total offer count, with skipped offers retaining their original rank

#### Scenario: Open and return from an immutable item list
- **WHEN** the user clicks the card outside an interactive control, clicks its media, or activates 查看明細 without a recognized drag
- **THEN** the main slot renders OfferDetails for the selected offer, showing every item with its image or placeholder, trusted label or category, quantity, contract-provided role and natural-language terms without displaying IDs
- **AND** prices appear only where supplied; missing per-item prices do not display a placeholder such as 未提供單品價格 and the UI does not divide the total or invent a discount
- **AND** the total, recommendation reason, tradeoffs and complete expiry remain available with read-only quantities and the same adoption rules
- **AND** returning restores the previous card, skip collection, scroll position and focus without an API mutation

#### Scenario: Suppress a synthetic click after dragging
- **WHEN** a recognized drag ends, whether committed or returned below threshold
- **THEN** the resulting click does not open details or activate adoption again
- **AND** a later independent click or keyboard activation can open details normally

#### Scenario: Inspect details while the offer expires
- **WHEN** the offer expires or becomes accepted or rejected while its details are visible
- **THEN** the details and deck share the authoritative eligibility and pending state, disabling invalid adoption immediately
- **AND** returning to the deck cannot revive the old offer or reset its expiry


### Requirement: Hide technical API data from result presentation
The UI SHALL NOT render request_id, offer_id, product_id, terms_id, campaign_id, raw JSON, decision payloads or source_documents in offer, details, negotiation, accepted or rejected views. These fields SHALL remain available in the v0.3 contract for validation, persistence, callbacks and handoff.

#### Scenario: Inspect offer result presentation
- **WHEN** the user views the deck, details, accepted summary or rejected summary
- **THEN** no technical identifiers, raw JSON, decision data or source_documents are present in the DOM as user-visible content
- **AND** the UI still shows seller, total price, delivery, expiry, item category, quantity, natural-language terms, recommendation reason, tradeoffs, Sponsored labels and saved feedback summary
