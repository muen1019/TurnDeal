# Unified Result contract

Approved scope: use main's catalog, five Seller branches, up to five rounds, is_final and stop_reason; retain durable accept/reject and original feedback/source_documents handoff. One active schema: contracts/a2a-commerce.v0.3.schema.json. Earlier contracts are historical archives, not alternative runtime inputs.

POST /api/requests returns 202/formatting; GET returns a saved RequestSnapshot with decision; POST decisions returns 200/accepted or 200/rejected. Reject never rewrites documents, creates a child, purchases, or redeems. No 503 response is advertised until implemented.

Persistence uses main's migrations and normalized tables, with an additive migration for saved Result state and decision response. Published offers and snapshots remain immutable; decision state is stored separately. Existing databases are backed up before migration. Mock generation reads the shared catalog and preserves early seller completion, product constraints and reproducible ranking.

Verification: shared contract and fixture validation, main database migration tests, backend HTTP/persistence/restart/concurrency tests, frontend type generation and tests, production builds, and real browser accept/reject recovery. This change does not implement real model negotiation, Buyer Agent intent rewriting, payments, or redemption.
