# Independent Evaluator

`src/evaluator/index.mjs` exports `evaluate({ db, requestId, buyerId, apiKey, model, fetchImpl, now, options })`.
It consumes a completed persisted negotiation run. Caller-supplied offers, campaigns, prompts and floor prices are not accepted as ranking input.

1. Check buyer ownership and the immutable negotiation input/Offer provenance in SQLite.
2. Recheck hard constraints, live inventory, seller availability, terms, expiry and bundle consent.
3. Project only the existing `EvaluatorInput` contract into a new independent Responses call (`store: false`). The exact Structured Outputs format is loaded from `contracts/openai/evaluator-output.schema.json` without changing it.
4. Validate a complete permutation of eligible IDs, consecutive ranks, explanations and explicit preference order. Invalid output, API errors, refusal, truncation, missing key or timeout trigger deterministic ranking.
5. Within a short SQLite transaction, recheck current eligibility and publish the immutable `RequestSnapshot`. If the set changed during inference, rebuild ranking and explanations for the remaining set without another model call.
6. Rank all eligible Offer IDs, then group by Seller using its highest-ranked Offer. The other variant remains an alternative with its own ID. Five Sellers can therefore produce seven ranked Offers and five display groups.

Ranking uses the ordered `intent.preferences` lexicographically: lower price, faster delivery, or higher trust. Trust compares personal band, personal rating, then marketplace rating; missing ratings use a neutral value of 3, not a fabricated transaction. With no explicit ordering, the fallback uses price, delivery, trust. Remaining ties use delivery, trust, standalone before bundle, then stable Offer ID. Free gifts do not receive an automatic ranking bonus. A cheaper authorized bundle retains its price advantage. Backend sends offers in this canonical order to reduce Discovery order bias; the real model explains and returns the ranking under these rules. Backend still checks the complete returned order. Ranking weights and priorities are not left to the model to invent.

The current shared `EvaluatorInput` includes Offer IDs and features, but not product attributes or full warranty terms. The model is explicitly forbidden to infer shape/size/color from SKU IDs or warranty from a terms ID. Required attributes are checked by Backend; soft attribute-based ranking awaits a reviewed input-contract extension.

Default Evaluator model: `gpt-4.1-2025-04-14` ([official model documentation](https://developers.openai.com/api/docs/models/gpt-4.1)). Buyer/Seller defaults remain `gpt-4.1-mini-2025-04-14`. One call, 20-second timeout, 2,500 maximum output tokens and 60,000 conservative total-token reservation. The existing `API_KEY` field is shared with negotiation. `EVALUATOR_MODEL` is an optional E2E CLI override. Private credentials are never returned or written to reports.

`evaluation_runs` claims prevent concurrent paid calls. Completed results replay from SQLite, including after expiry, as historical snapshots. Replay does not refresh expiry or grant permission to buy. Acceptance and redemption must perform their own live checks. `recoverInterruptedEvaluations(db)` is startup-only: interrupted jobs become failed, never silently issue another paid call.

`006_evaluation_audit.sql` retains the independent prompt, response, model usage and validation evidence locally. Public reports omit raw audit data and credentials.

`npm run test:evaluator` covers schema/set attacks, preference ordering, timeout and API failure, ad isolation, complete seven-Offer/five-group output, live stock/expiry changes, replay, ownership, concurrency and restart recovery. This is a Backend module; HTTP, swipe interactions and redemption are separate integrations.

## Combined E2E

`npm run test:e2e:full` runs offline; `npm run test:e2e:full:live` uses `.env`'s `API_KEY` for Buyer, Seller and Evaluator. Reports are written to `reports/full-e2e/` as JSON, Markdown and HTML.

The test harness starts from a parsed request fixture in SQLite, feeds the configured canonical Seller catalog into upstream `createOrchestratorHandoff().prepare()`, and gives its unchanged `OrchestrationResult` to the full-round negotiation manager. Real registered Seller functions handle all rounds; the upstream first-round-only dispatcher is not called a second time. Its dispatch behavior remains covered by upstream handoff tests. No new production Formatter or orchestration implementation is introduced.

The canonical A–E policies are explicitly configured demonstration policies; the separate imported 15-Seller draft policy template remains inactive. Natural-language formatting, HTTP/UI and purchase/redemption are outside this E2E's boundary.

Explanation validation checks own price/delivery, supported numeric comparison values and common false fastest/lowest claims. It is a guard against observed errors, not a proof of every natural-language assertion; the final E2E report is also reviewed against actual offers.
