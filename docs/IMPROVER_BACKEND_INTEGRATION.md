# Improver follow-up API integration

This change delivers backend clarification and automatic next-round requests. It contains no frontend, purchase UI, browser-test scripts, or UI assets. The existing frontend requires the integration below before users can exercise the new workflow.

## Setup

- Use Node 24+ for the integrated runtime. Install root/backend dependencies and run `npm --prefix backend run build` before starting it.
- Startup applies migration 006 after existing migrations. It preserves existing jobs/revisions, adds immutable clarification successors and durable workflow links, and does not enroll historical jobs into automatic next rounds. Back up the database before deployment; use migrations, not `db:rebuild`.
- Default Improver mode is offline/deterministic. For an embedding that runs only Improver live, pass `improverOptions: {mode: 'live'}` to `createRuntimeApp`; its provider reads server-side `API_KEY` from the environment or supported `.env` locations. Optional `IMPROVER_MODEL` defaults to `gpt-4.1-mini`. Never send the key to the browser. The application-wide live launcher has its own server environment setup.
- Bind `buyerId(req)` to authenticated identity. The default is the demo buyer, not production account authentication.

## 1. Submit selection

Keep skipped offer IDs locally until a decision is submitted. Use `POST /api/requests/{request_id}/decisions` with `Content-Type: application/json` and a stable `Idempotency-Key` per logical submission.

All rejected:

```json
{"action":"reject","selection_version":1,"rejected_offer_ids":["offer_1","offer_2"],"feedback":""}
```

Replace example IDs with the complete nonempty ranked offer set from the current snapshot. Empty feedback is allowed for this versioned all-rejected decision. Without an explicit adjustment, Improver produces a draft and asks for clarification.

Accepted after some rejections:

```json
{"action":"accept","offer_id":"offer_2","selection_version":1,"rejected_offer_ids":["offer_1"]}
```

Exclude the accepted offer from rejected IDs. Continue the existing purchase flow after the saved acceptance. Its rejected subset is improved in the background, without changing the accepted offer or creating a child. First-offer acceptance with an empty rejected set creates no improvement job. Legacy unversioned decisions remain supported but do not enroll in this workflow.

## 2. Read improvement status

Poll `GET /api/requests/{request_id}/improvement`. A response of `null` means no improvement job exists.

- `status`: `queued`, `running`, `ready`, `needs_clarification`, or `failed`.
- `mode`: `all_rejected` or `accepted_with_rejections`.
- `result`: nullable; contains `intent_revision_id`, `intent_state`, `documents`, `preference_updated`, and `questions`.
- `workflow_enabled`: whether this request has the new durable follow-up workflow. Historical jobs can return false.
- `can_clarify`: render a clarification input only when true.
- `next_request_id`: the actual created child ID, or null. Do not infer that a child exists from `ready` alone.
- `workflow_error`: a handoff error such as `child_creation_failed`; the server retries eligible handoffs. It does not invalidate the committed improvement.
- `error`: job error, or null.

Poll while queued/running, or while ready with workflow enabled and no child. Stop polling a terminal historical job with workflow disabled. A slower retry is appropriate for workflow errors. The backend recovery timer runs every five seconds.

## 3. Submit clarification

`POST /api/requests/{request_id}/improvement/clarifications`, with a new stable `Idempotency-Key`:

```json
{"improvement_id":"imp_current_from_get","feedback":"這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。"}
```

The feedback must contain 1–2000 characters and supplies the **complete replacement adjustment instructions**. Original purchase constraints remain unless explicitly changed. Previous adjustment feedback remains in immutable old jobs, but is not accumulated as the current instructions.

Response: HTTP 202, `{"request_id":"req_parent","improvement_id":"imp_new","status":"queued"}`. Poll the parent improvement endpoint again to follow the new job. Persist the exact body and key before submission; a timeout/reload retry must reuse both. Exact retries replay the original 202, even if processing finished. Stale jobs or another-key duplicate answers return 409; refresh status before submitting a new action. Cross-buyer or mismatched request/job IDs return 404. Invalid input returns 400.

## 4. Open the next round

Once `next_request_id` is non-null, load it with the existing `GET /api/requests/{id}` flow. Do not create a second request from the client. The server creates exactly one child per rejected parent workflow, with inherited root, parent ID, and document revision incremented by one. The rejected parent's documents remain unchanged.

The child uses committed intent and preference versions and frozen Formatter output, not a later global preference edit. Startup resumes children that were committed but not yet dispatched. A crash after processing stages start retains the existing interrupted/failed policy rather than automatically repeating those stages.

## Preference and learning boundaries

Intent is request-scoped; global preference is versioned per buyer. Preference changes require an explicit supported long-term statement. Left swipes alone neither authorize a global patch nor reveal the reason for rejection. Normal new conversations and the account preference editor are not yet synchronized with this global store. Rejected products are not automatically blacklisted, so the next round can return the same commercial options.

## Verification

Run `npm test` for integrated contracts, migrations, modules, runtime and Improver coverage. `npm run test:improver` includes seven follow-up scenarios: child pipeline and frozen preferences, clarification replay/conflicts, clarification rollback, child-link rollback, restart dispatch, third-round lineage, and preserving populated pre-006 databases without historical enrollment.

The separately exercised local browser/LLM integration is not part of this backend-only commit and its results must not be treated as tests of UI delivered by this PR.
