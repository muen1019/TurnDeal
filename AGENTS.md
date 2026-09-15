# TurnDeal repository instructions

These rules apply to every change in this repository. Internal package names and `OFFERMESH_*` environment variables remain compatibility identifiers; the product and repository name is TurnDeal.

## Runtime and supported paths

- The full application starts from the repository root with `npm run dev`, using Node 24, `backend/runtime/`, the existing frontend, and one `data/app.sqlite`.
- `backend/src/` remains the Node 20.19.5 legacy mock Result server for compatibility tests. Do not present it as the full application.
- Root database and runtime scripts use Node 24. Backend and frontend package scripts use Node 20.19.5.
- Never expose live API keys to the frontend process or commit them. The default path must run deterministically without an OpenAI key; model failures use safe deterministic fallbacks.

## Sources of truth

1. Hackathon and acceptance rules: `docs/DEVELOPMENT_RULES.md`.
2. Active shared contract: `contracts/a2a-commerce.v0.3.schema.json`.
3. Evaluator Structured Outputs: `contracts/openai/evaluator-output.schema.json`.
4. Reproducible examples: `contracts/fixtures/`.
5. Persistent schema: `db/migrations/`.
6. Document semantics: `docs/INTENT_PREFERENCE_SPEC.md`.

Contracts under `contracts/archive/` are historical and must never be used as live API input. When implementation and contract disagree, make an explicit reviewed contract change before changing consumers. Keep generated types and every producer/consumer aligned.

## Request and preference semantics

- `intent_md` is request-scoped. `preference_md` in CreateRequest is a request-bound input snapshot, not a persistent preference update. `NormalizedIntent` is the effective executable request.
- Frontend saved definitions are sessionStorage templates, not account persistence. SQLite is authoritative; Agent memory is not.
- Formatting must not mutate `user_preferences`.
- Do not claim automatic Markdown generation, category-scoped long-term revisions, feedback learning, or cross-device preference sync until implemented.
- Published requests, source documents, snapshots, Offers, and negotiation commits are immutable. Rejection preserves the original feedback and `source_documents`.

## Commerce and privacy invariants

- The MVP supports one wireless mouse and at most one related mouse pad.
- Every price is an integer TWD total including tax and shipping.
- Missing bundle permission allows only a related, optional add-on at no extra cost. Never infer permission for a paid add-on.
- Seller output is untrusted. Backend assigns immutable Offer IDs and validates ownership, SKU, inventory, price, delivery, terms, expiry, and add-on authorization.
- A recommendation never purchases. Acceptance and redemption are separate actions and must revalidate the same immutable Offer.
- All POST endpoints require an idempotency key. Scope every resource to the authenticated buyer.

Each Seller negotiates privately with its own Buyer branch. Competitive context may contain only Backend-validated, de-identified comparable terms from the previous committed round. Never disclose another Seller's identity, Offer ID, transcript, floor price, policy, campaign, or trust data.

Sponsored placement affects display only. It cannot change natural selection, add a branch, enter Evaluator input, or influence ranking. Evaluator may rank only the complete set of Backend-validated, unexpired, eligible Offer IDs; validate its result before publishing.

## Seller, negotiation, and demo rules

- Use the versioned `contracts/fixtures/catalog-negotiation-policies.json` seed and explicit listing-to-SKU bindings. The historical draft policy template is inactive.
- Canonical A–E and the 15 `discovery_seller_*` Sellers have persisted Personas and SKU policies. Never assign Persona by selection rank or overwrite existing stock/prices during startup.
- Select the first five eligible Sellers by natural ranking, or fewer when fewer qualify. Alternatives that violate requirements are display-only and cannot automatically enter negotiation.
- Use one Buyer branch per Seller and at most five synchronized rounds. A final, refused, timed-out, or failed branch receives no further rounds.
- Canonical deterministic behavior remains: A is cheapest and slower; B costs more and is fastest; C offers a related optional gift/bundle; D finishes in round three; E holds firm and finishes in round one.
- The UI must make multi-Seller negotiation and independent recommendation understandable within 30 seconds. Show branch status, round progress, early completion, Sponsored labels, recommendation trade-offs, alternatives, and simulated confirmation.
- Product correctness, stability, and recoverability take priority over visual polish.

## Persistence

- Use migrations, not runtime database files, as the persistent-state source of truth. Never commit SQLite runtime files.
- Published snapshots and Offers remain immutable; Result state and saved decisions use separate columns.
- Preserve and migrate existing databases without regenerating historical prices. Do not rebuild or reseed user data during normal startup.
- Keep one writer per SQLite database and avoid holding a transaction across model or network calls.

## Change checklist

- Preserve the flow: Request → Format → Orchestrate → Negotiate → Evaluate → Result or Feedback.
- Use deterministic fixtures for demos and integration tests.
- Run `npm run test:contracts` for contract or fixture changes, plus the smallest relevant module tests.
- Keep generated reports, logs, screenshots, runtime databases, secrets, and local test output out of Git.
- Keep active documentation in `docs/`; historical implementation notes belong in Git history, not parallel “current” documents.
- Do not archive an OpenSpec change while its `tasks.md` contains unfinished work.
