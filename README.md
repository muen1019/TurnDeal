# TurnDeal

> Turn Your Need into a Deal

TurnDeal is a platform-owned negotiation layer for agent-to-agent commerce. Describe what you need, your budget, and delivery constraints; TurnDeal privately negotiates with multiple Seller Agents, validates their offers, and presents the options worth considering.

You always make the final decision. Sponsored placement never affects recommendation ranking, and accepting an offer does not purchase it.

## How it works

```mermaid
flowchart LR
    Request --> Formatter --> Orchestrator
    Orchestrator --> A["Buyer A ↔ Seller A"]
    Orchestrator --> B["Buyer B ↔ Seller B"]
    Orchestrator --> C["Buyer C ↔ Seller C"]
    Orchestrator --> D["Buyer D ↔ Seller D"]
    Orchestrator --> E["Buyer E ↔ Seller E"]
    A --> Evaluator
    B --> Evaluator
    C --> Evaluator
    D --> Evaluator
    E --> Evaluator
    Evaluator --> Swipe["You decide"]
    Swipe -->|Accept| Purchase["Confirm test purchase"]
    Swipe -.->|Reject or revise| Request
```

## Highlights

- Parallel, private Buyer／Seller negotiation with at most five synchronized rounds.
- Backend validation of inventory, price, delivery, terms, expiry, benefits, and add-on permission.
- Independent evaluation of the complete eligible Offer set.
- Explicit buyer profile, weighted preferences, model selection, clarification, and versioned request improvement.
- Desktop and mobile-first flows, including an ACP test checkout with simulated payment.
- Deterministic offline mode and bounded model fallbacks.

The MVP focuses on one wireless mouse and at most one related mouse pad. Seller, price, cost, rating, benefit, and fulfillment data are synthetic demo data.

## Quick start

Requires Node.js 24.

```powershell
git clone https://github.com/muen1019/TurnDeal.git
cd TurnDeal
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm run dev
```

Open <http://127.0.0.1:5173/chat> and enter:

```text
滑鼠 800 元左右，預算 1,000 元含稅運，7 天內到貨。
```

`npm run dev` is fully offline. It still executes Formatter rules, Discovery, Seller negotiation, Evaluator fallback, SQLite persistence, clarification, Improver, and simulated checkout.

To enable supported models with a server-side key:

```powershell
npm run dev:secure
```

The launcher reads the key through a hidden terminal prompt. It does not write the key to a file or pass it into the frontend environment.

## Mobile demo

```powershell
npm run dev:mobile
```

This starts the isolated offline mobile flow with an in-memory SQLite database. `npm run dev:mobile:secure` enables the paired live-model development flow. Both are development-only services for trusted local networks; use fictional profile and address data.

See [mobile UI](docs/MOBILE_UI.md) and [mobile live mode](docs/MOBILE_LIVE.md).

## Safety boundaries

- Seller and model output is untrusted; Backend creates immutable Offer IDs and eligibility.
- Each Seller sees only its own RFQ, policy, history, and de-identified comparable terms.
- Campaign data never enters Evaluator input or natural ranking.
- A paid add-on requires explicit user permission.
- Every POST uses an idempotency key and every resource is buyer-scoped.
- Request documents, published snapshots, Offers, and committed rounds remain immutable.
- Accepting, improving, and purchasing are separate operations. Test checkout never performs real payment or shipping.
- SQLite is authoritative; browser drafts and Agent memory are not.

## Repository

| Path | Purpose |
| --- | --- |
| `backend/runtime/` | Node 24 integrated API and mobile runtime |
| `backend/src/` | Node 20 legacy Result server and shared modules |
| `frontend/` | React／Vite application |
| `src/` | Formatter, Orchestrator, Negotiation, and Evaluator core |
| `contracts/` | JSON Schema, model output schemas, and fixtures |
| `db/migrations/` | Authoritative SQLite schema |
| `docs/` | Current architecture and operating documentation |
| `openspec/changes/` | Active specifications and unfinished tasks |

Internal `offermesh` package names and `OFFERMESH_*` variables remain compatibility identifiers. The product and repository name is TurnDeal.

## Documentation

- [Documentation index](docs/README.md)
- [Run the full app](docs/RUN_FULL_APP.md)
- [System design](docs/SYSTEM_DESIGN.md)
- [Buyer setup](docs/BUYER_SETUP.md)
- [Intent and preference semantics](docs/INTENT_PREFERENCE_SPEC.md)
- [Contracts](contracts/README.md)
- [Database](db/README.md)
- [Testing](docs/TESTING.md)

## Verification

```powershell
npm test
npm --prefix frontend test
npm --prefix frontend run build
```

See [testing](docs/TESTING.md) for focused and browser suites. Generated reports, logs, screenshots, runtime databases, and local test output are not committed.

## Hackathon scope and sources

The hackathon implementation includes contracts, migrations, Formatter, 120 synthetic listings, Seller policies, five-branch negotiation, independent evaluation, buyer setup, clarification, Result UI, versioned Improver, mobile flows, and ACP test checkout.

The app uses React, Vite, Express, sql.js, Ajv, Playwright, and other OSS pinned by package lockfiles. Specification workflow uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). The fixed ACP upstream version and license are recorded in `contracts/acp/`; Taiwan address reference attribution is in `frontend/src/reference/TAIWAN_ADDRESS_LICENSE.md`.
