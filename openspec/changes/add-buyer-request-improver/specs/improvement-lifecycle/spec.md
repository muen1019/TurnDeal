## ADDED Requirements

### Requirement: Admit only verified all-rejected events
The integration adapter SHALL admit an all-rejected event only for an authenticated buyer's awaiting_user request whose nonempty published ranked-offer set exactly matches the submitted rejected IDs, has not expired and has no accepted decision. Local skipped cards, no_match and expired offers SHALL NOT independently constitute a committed all-rejected event. Recording rejection and queuing improvement MUST be atomic and mutually exclusive with acceptance.

#### Scenario: A few local skips
- **WHEN** the user skips some but not all ranked offers
- **THEN** no improvement is queued

#### Scenario: Accepted concurrently
- **WHEN** acceptance and all-rejected submission race for the same request
- **THEN** only one decision commits; rejection queues full-set improvement, while acceptance queues background improvement only for its submitted earlier rejections

#### Scenario: Expiry during browsing
- **WHEN** the last card is skipped after an offer in the submitted choice set expires
- **THEN** the adapter requires reconciliation rather than treating expiry as user rejection

### Requirement: Use an opt-in versioned selection contract
The shared v0.3 decision schema SHALL support opt-in selection_version: 1 and rejected_offer_ids. Existing unversioned bodies and saved responses SHALL remain valid. Empty rejection feedback SHALL require a nonempty versioned selection set, verified server-side. No adapter SHALL fabricate user feedback or retrofit historical decisions. GET /api/requests/{request_id}/improvement SHALL expose only buyer-scoped public status and results. Global preference editing, clarification submission and child linkage require separate contracts before enablement.

#### Scenario: Final left swipe
- **WHEN** the user explicitly rejects the final card of a nonempty published ranking
- **THEN** the client automatically submits the complete set using the versioned decision contract
- **AND** shows improvement status only after the server acknowledges the saved decision

#### Scenario: Historical rejected requests
- **WHEN** an Improver-capable application starts on an existing database
- **THEN** historical rejections do not automatically create improvement jobs

### Requirement: Improve earlier rejections after acceptance
An accepted selection with a nonempty earlier rejected subset SHALL atomically queue one background improvement. The rejected IDs MUST belong to the same published ranking and MUST exclude the accepted offer. The accepted offer and published documents MUST remain unchanged; this job MUST NOT create a child or block purchasing. Acceptance without earlier rejections SHALL NOT queue a job.

#### Scenario: Right swipe after left swipes
- **WHEN** acceptance commits with a valid earlier rejected subset
- **THEN** the user can proceed to purchase while the worker processes only that subset
- **AND** absent explicit long-term text, global preference remains unchanged

### Requirement: Persist recoverable bounded jobs
Jobs SHALL be unique per parent request and buyer-scoped, with immutable trigger evidence and queued/running/ready/needs_clarification/failed states. Workers SHALL claim jobs with a 90-second lease and ownership token, allow at most two total claims, and persist model attempt counts before calls. A stale token MUST NOT commit. Failed storage SHALL NOT be reported as a saved revision.

#### Scenario: Worker crashes after model invocation
- **WHEN** the lease expires after an invocation whose outcome was not saved
- **THEN** recovery checks committed results first and counts the invocation against the remaining model budget
- **AND** a resumed worker does not reset the attempt budget

#### Scenario: Late worker response
- **WHEN** an old worker returns after another worker acquired the lease
- **THEN** the old worker cannot publish documents or preference changes

#### Scenario: Claim budget exhausted
- **WHEN** a job has exhausted both claims without a committed result
- **THEN** it becomes failed with a recoverable error record rather than remaining running indefinitely

### Requirement: Commit revisions atomically and detect preference conflicts
Committer SHALL atomically save a new intent revision, any approved global preference revision, effective preference snapshot and terminal result using the active lease and expected global revision. Each job SHALL produce at most one committed intent result. Base-revision conflicts SHALL trigger at most one deterministic rebase and validation without extra model calls; unresolved or repeated conflicts SHALL save a needs_clarification draft without overwriting concurrent preference edits.

#### Scenario: Concurrent unrelated preference edit
- **WHEN** the global revision changes in an unrelated entry and the original patch still applies unambiguously
- **THEN** the system may rebase once, revalidate intent and preserve the concurrent entry

#### Scenario: Concurrent change to the same preference
- **WHEN** the target preference no longer matches the patch before value
- **THEN** the system saves a clarification draft and leaves the latest global preference intact

#### Scenario: Transaction fails midway
- **WHEN** persistence fails while saving revisions
- **THEN** no partial ready intent or global preference update becomes visible

### Requirement: Expose results separately from child execution
A ready result SHALL identify improvement_id, intent_revision_id, preference_revision_id, preference_updated, exact effective document snapshots and change summaries. A needs_clarification result SHALL identify the saved intent draft and questions without claiming a child exists. Only the outer workflow SHALL create a child from ready output, atomically deduplicated by improvement_id, using the same root, rejected parent and incremented request document revision.

#### Scenario: Ready notification lost
- **WHEN** a workflow loses notification after the improvement commits
- **THEN** it can reread the same result and retry delivery without regenerating documents or creating a second child

#### Scenario: Global preference changes after ready
- **WHEN** the global preference changes before the workflow creates the child
- **THEN** the child uses the committed improvement snapshot, not silently substituted latest content

#### Scenario: Needs clarification
- **WHEN** the improvement has a saved draft but no validated actionable change
- **THEN** the API returns questions and the workflow does not start another negotiation

### Requirement: Reconcile unknown outcomes without automatic loops
Future clients SHALL retain the exact request body and idempotency key across unknown submission outcomes and reconcile persisted status before creating another operation. Each all-rejected event SHALL authorize at most one follow-up round; the next round SHALL wait for a new user decision. API status SHALL distinguish saved rejection, running improvement, saved draft, ready documents and an actually created child.

#### Scenario: Timeout after rejection commit
- **WHEN** the client times out after the server commits rejection and its job
- **THEN** retry or readback resolves to the existing operation rather than enqueueing a second job

#### Scenario: Follow-up also has no usable alternative
- **WHEN** a follow-up cannot produce a usable alternative
- **THEN** the system reports that state and does not recursively start further improvements without a new valid user decision
