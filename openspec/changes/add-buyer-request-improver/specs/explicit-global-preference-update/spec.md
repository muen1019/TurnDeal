## ADDED Requirements

### Requirement: Update only from explicit long-term user statements
Improver MUST update global preference only when verifiable user source text explicitly expresses a preference applicable across purchases or across purchases in a named category. Single-purchase wording, rejection behavior, repeated behavior and model confidence SHALL NOT qualify. Ambiguous evidence SHALL result in keep.

#### Scenario: Explicit global preference
- **WHEN** the user states 我買東西一向先看耐用度
- **THEN** the model may propose a durability preference with all_categories scope and an exact source quote

#### Scenario: One-time price preference
- **WHEN** the user states 這次想便宜一點
- **THEN** the current intent may change but the global preference remains unchanged

#### Scenario: Repeated rejection behavior
- **WHEN** the user rejects expensive offers in several rounds without explicitly stating a long-term preference
- **THEN** global preference remains unchanged

### Requirement: Validate exact evidence and semantic scope
Every preference operation SHALL reference stored user evidence and an exact quote supporting the operation's meaning, long-term applicability and scope. Quote existence alone SHALL NOT authorize a patch. Unsupported or ambiguous language MUST fail closed to keep. Seller and generated text MUST NOT count as user evidence.

#### Scenario: Category-specific long-term preference
- **WHEN** the user states 我挑滑鼠一直都偏好小尺寸
- **THEN** a small-size preference may be added only under category:mouse
- **AND** it does not apply to all products

#### Scenario: Quote exists but does not support the value
- **WHEN** a patch cites a valid durability quote to add a black-color preference
- **THEN** the patch is rejected for lack of supporting meaning

### Requirement: Apply targeted versioned preference operations
Preference changes SHALL be add, replace or remove operations against stable preference IDs and a base revision. Replace/remove MUST match the prior value; add MUST target an unused ID. Unrelated entries and user-authored text SHALL be preserved. If a document cannot be safely addressed, the system MUST keep it unchanged instead of replacing the whole document.

#### Scenario: Update mouse preference only
- **WHEN** a valid mouse-size patch is applied to a document also containing unrelated shopping preferences
- **THEN** only the identified mouse entry changes and unrelated text remains intact

#### Scenario: Existing Markdown has no reliable entry mapping
- **WHEN** the representation layer cannot reliably locate a proposed replacement
- **THEN** the patch is not applied and the document is preserved

### Requirement: Preserve intent independence after dropping patches
Invalid independent preference operations SHALL be discarded with a recorded reason; dependent or conflicting operations SHALL be discarded together. Intent SHALL be revalidated against the final effective preference after discarded operations. Purchase consent MUST NOT be inferred from global preferences.

#### Scenario: Valid intent and unsupported global update
- **WHEN** the intent validly incorporates a purchase-specific price preference but the proposed global patch lacks a long-term statement
- **THEN** the patch becomes keep and the valid intent may still become ready after revalidation

#### Scenario: Inferred paid add-on permission
- **WHEN** the global document says the user generally likes accessories
- **THEN** neither a preference patch nor the intent may treat that statement alone as consent to a paid add-on in this purchase

### Requirement: Publish global updates only with validated ready intent
Committer SHALL publish an approved global preference revision atomically with the ready intent and effective preference snapshot. A needs_clarification result SHALL save the intent draft and proposal audit only, without publishing proposed preference changes. Historical request snapshots SHALL remain immutable.

#### Scenario: Clarification still required
- **WHEN** a proposal contains an explicit long-term preference but the purchase intent still requires clarification
- **THEN** the preference proposal is retained for review but the authoritative global document is not changed

#### Scenario: Later global update
- **WHEN** a later improvement updates the user's global preference
- **THEN** earlier request snapshots retain their original preference content and source version
