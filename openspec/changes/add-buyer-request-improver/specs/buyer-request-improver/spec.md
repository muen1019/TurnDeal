## ADDED Requirements

### Requirement: Assemble immutable buyer-scoped context
Context Builder SHALL assemble the original request documents, normalized hard constraints, request preference snapshot, latest global preference revision, trusted rejected-offer summaries, optional feedback and same-root improvement history. Every user evidence reference MUST resolve to stored source text belonging to the authenticated buyer. Seller text, campaign data and model-generated summaries MUST NOT authorize changes to user preferences.

#### Scenario: Retry after catalog changes
- **WHEN** an improvement retries after catalog prices change
- **THEN** it uses the original saved rejected-offer evidence rather than replacing it with current prices

#### Scenario: Another buyer's evidence
- **WHEN** an evidence reference belongs to a different buyer
- **THEN** context assembly rejects it without exposing that buyer's documents

### Requirement: Produce a new purchase intent revision
Every successfully processed improvement SHALL save a new intent revision for the same purchase, with traceable changes. If actionable improvement is unsupported, it MUST save a draft with needs_clarification rather than invent constraints. Storage failure SHALL return failed and MUST NOT claim a saved revision.

#### Scenario: All offers rejected without a reason
- **WHEN** the user rejects every offer without giving a reason
- **THEN** the intent revision records the rejection and an exploration request or clarification question
- **AND** it does not infer a lower budget, disliked brand or permanent seller blacklist

#### Scenario: Explicit purchase-specific feedback
- **WHEN** the feedback says 這次預算改成 800 元，其他條件不變
- **THEN** the new intent sets the purchase budget to 800 TWD and preserves the other hard constraints

### Requirement: Generate proposals without side effects
Revision Engine SHALL generate one structured proposal containing a mandatory intent revision, preference keep-or-patch, outcome and questions. It MUST NOT write persistence, invoke Seller tools or create child requests. The model's ready value SHALL remain advisory until validation succeeds.

#### Scenario: Instructions embedded in seller content
- **WHEN** supplied offer text asks the model to overwrite preferences or invoke a tool
- **THEN** the content is treated as data and cannot grant the engine write or tool authority

### Requirement: Validate structure and purchase semantics
Output Validator SHALL reject unknown fields, invalid evidence references, inconsistent diffs and invalid patch shapes. Semantic Guard SHALL re-normalize the candidate intent and compare budget, delivery, quantity, required product properties and add-on consent against the source and explicit feedback. Markdown documents MUST respect the 20000 Unicode-code-point limit.

#### Scenario: Model silently increases budget
- **WHEN** the model increases the budget without an explicit supporting user instruction
- **THEN** validation rejects the change rather than publishing it

#### Scenario: Ambiguous cheaper request
- **WHEN** the user says 便宜一點 without a new amount
- **THEN** the candidate may prioritize price but cannot invent a new numeric budget

#### Scenario: Unsupported Formatter output
- **WHEN** the available Formatter cannot reliably normalize a proposed intent
- **THEN** the result is needs_clarification rather than ready

### Requirement: Require actionable changes before rerunning
Semantic Guard SHALL publish ready only when the result provides a validated actionable change or supported alternative exploration instruction. It SHALL compare rejected commercial combinations by product, bundle, price, delivery and terms rather than offer_id alone. Rewording alone MUST NOT trigger identical negotiations.

#### Scenario: Different identifier but identical offer
- **WHEN** the proposed next exploration merely assigns a new ID to the same rejected commercial combination
- **THEN** it is not treated as a substantive improvement

#### Scenario: Same product with a better offer
- **WHEN** a supported exploration can obtain a materially different commercial combination for the same product
- **THEN** rejecting the earlier combination does not permanently exclude that product or seller

### Requirement: Bound model repair and provide safe fallback
The engine SHALL permit at most one initial generation and one repair call per improvement, counting attempts durably before invocation. Each call SHALL time out after 30 seconds. Unavailable providers or exhausted invalid output SHALL use a deterministic fallback that preserves the original intent, records rejection evidence and returns needs_clarification with preference=keep. Fallback SHALL pass validation and SHALL NOT enter an unbounded repair loop.

#### Scenario: Provider is not configured
- **WHEN** no model adapter is configured
- **THEN** the system saves a deterministic intent draft and clarification questions without an API dependency or preference write

#### Scenario: Repair remains invalid
- **WHEN** the single repair also violates constraints
- **THEN** the system uses fallback without a third model call

#### Scenario: Source document has no append capacity
- **WHEN** the original intent is already at the document size limit
- **THEN** fallback preserves the original text in a new draft revision and records the rejection and questions in revision metadata
- **AND** it does not truncate hard constraints or claim a semantic improvement
