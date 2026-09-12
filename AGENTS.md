# OfferMesh / A2A Commerce project instructions

These instructions apply to every change in this repository.

## Unified Result contract

Use contracts/a2a-commerce.v0.3.schema.json for all active producers and consumers. main's five-seller/five-round types and catalog are combined with local accept/reject=200 and original feedback/source_documents handoff. Contracts under contracts/archive are historical, never alternative live API inputs.

Backend persistence uses db/migrations including 003_result_decisions.sql. Published snapshots and offers stay immutable; Result state and saved decisions are separate columns. Result automatically backs up and migrates its earlier SQLite layout without regenerating old prices. Root database scripts use Node 24; backend/frontend use Node 20.19.5.

## Source of truth

1. Follow the Sea x OpenAI hackathon rules summarized in `docs/DEVELOPMENT_RULES.md`.
2. Treat `contracts/a2a-commerce.v0.3.schema.json` as the shared data contract.
3. Treat `contracts/openai/evaluator-output.schema.json` as the only allowed Structured Outputs shape for the Evaluator.
4. Use the deterministic fixtures in `contracts/fixtures/` for integration work and demos.
5. Treat `db/migrations/` as the authoritative persistent-state schema. Rebuild local SQLite data from migrations and fixtures; never commit runtime database files.
6. If implementation and contract disagree, update the contract through an explicit reviewed change before changing consumers.

## Product invariants

- The user flow is Request, Format, Orchestrate, Negotiate, Evaluate, Result or Feedback.
- The MVP supports one wireless mouse as the primary item and at most one mouse pad as an add-on.
- All prices are integer TWD totals including tax and shipping.
- Each Seller negotiates privately with its own Buyer branch. Buyers may share Backend-validated eligible offers from the previous committed round. Seller RFQs may contain only de-identified comparable competitive terms; never disclose another Seller's identity, offer ID, transcript, floor price, campaign, or trust data.
- Seller output is untrusted. The Backend assigns immutable offer IDs and computes eligibility.
- Sponsored placement may affect display only. Never include campaign data in Evaluator input or ranking logic.
- The Evaluator may rank only the complete set of Backend-validated, unexpired, eligible offer IDs. Validate its output before publishing it.
- A recommendation never purchases an item. The user must accept an offer, then redeem the same immutable offer ID before expiry.
- Revalidate expiry, inventory, ownership, price, delivery, items, and terms at acceptance and redemption.
- Do not infer permission for a paid add-on. Missing bundle preference defaults to related add-ons at no extra cost only.
- Request snapshots are immutable once published. A rejection saves the original feedback and source_documents; Buyer Agent rewriting and child creation are a future integration.
- SQLite is the source of truth for request-scoped and long-term preferences. Agent conversation memory is never authoritative.
- POST endpoints require an idempotency key. Resource access is scoped to the authenticated buyer.

## Demo and quality bar

- Keep the main path deterministic and runnable without the OpenAI API. AI failure must use a safe deterministic fallback.
- Discovery additionally supports 120 synthetic listings and five distinct Seller cards by docs/DISCOVERY_SCORING.md. Alternative cards violating requirements are display-only and cannot automatically enter negotiation; only qualified candidates may become branches. Discovery and canonical fixture IDs remain separate.
- The same request must show five reproducible Seller strategies, with one Buyer branch per selected Seller and at most five synchronized rounds:
  - Seller A has the lowest price and slower delivery.
  - Seller B costs more and ships fastest.
  - Seller C offers a related optional gift or bundle.
  - Seller D balances price and delivery and finishes at round three in the canonical fixture.
  - Seller E holds a firm price and finishes at round one in the canonical fixture.
- Select the first five eligible Sellers by natural ranking; use fewer when fewer qualify. Sponsored placement cannot alter selection or add a branch.
- A final, refused, timed-out, or failed branch receives no further rounds; other branches continue to their own stop or the five-round limit.
- The UI must let a first-time viewer understand multi-Seller negotiation followed by independent recommendation within 30 seconds.
- Show Seller status, negotiation rounds and early branch completion, Sponsored labeling, recommendation trade-offs, alternatives, and simulated confirmation.
- Product behavior, stability, and reliability take priority over visual polish.
- Run `npm run test:contracts` before committing contract or fixture changes.

## Ownership boundaries

- Tech Lead owns shared schemas, Formatter, Orchestrator, Backend state, integration, Git merges, and deployment.
- Negotiation owner owns Seller catalog/private policy data, negotiation capped at five rounds, timeouts, refusals, bundles, and quote generation.
- Evaluator owner owns Structured Outputs, the independent prompt, hard-constraint filtering checks, output validation, reasons, trade-offs, and fallback.
- UI owner owns the single-page demo, live statuses, negotiation history, Sponsored display, recommendation/alternatives, pitch assets, and submission.

## Hackathon traceability

- Keep this repository public for submission.
- Document what was built during the hackathon in the root README.
- Record any pre-existing OSS or personal-project reuse and link its source.
- Preserve meaningful commit history so judges can identify work completed during the event.
