# Selection integration — approved behavior

## Contract extension

Extend the active v0.3 decision contract with optional `selection_version: 1`,
`rejected_offer_ids` and (on acceptance) optional original `feedback`. The versioned
selection fields are opt-in; existing request bodies and saved responses remain valid.
Empty rejection feedback is allowed ONLY with version 1 and a nonempty rejected set.
The integrated runtime verifies IDs against the published ranking before writing.

## Required behavior

- Partial left swipes remain local until a terminal selection.
- An accepted offer with earlier rejected IDs atomically saves acceptance and one
  background improvement job. Acceptance proceeds to the existing purchase flow;
  the worker never changes the accepted offer, source snapshot, or creates a child.
- Acceptance without rejected IDs creates no improvement job.
- The final left swipe submits the complete, nonempty ranked set and automatically
  queues improvement. Merely having no right swipe, no offers, or inactivity does
  not trigger improvement. Expired all-rejected sets require reconciliation.
- Input feedback remains verbatim. Missing feedback is represented by an empty
  string, never synthetic user text. Swipes alone produce an intent draft and
  clarification questions; global preference stays unchanged.
- Only explicit long-term statements can update global preference. All intent
  revisions are separate records; no published request document is overwritten.
- GET `/api/requests/{request_id}/improvement` returns the buyer-scoped job status
  and public result, or null if no job. Restart recovery only processes existing
  queued/expired-lease jobs, not historical decisions.
- Clients must reuse the original idempotency key after unknown outcomes; frontend implementation is outside this backend change.

## Separate, not yet implemented

Automatic child requests, clarification resubmission, and an account-level global
preference editor remain separate integration work. A ready result does not claim
that a new negotiation has started.
