# Design — CryptKeeper Escrow

## Overview

CryptKeeper Escrow is a **Frankenstein** mashup of four technologies that
do not normally share a room:

1. **Solidity smart contract** (Foundry) — the vault that holds funds and
   only moves them on a verdict.
2. **AI verification agent** (TypeScript, zero external LLM calls) — the
   Crypt Keeper, a deterministic, explainable evidence checker.
3. **Next.js web app** (TypeScript, App Router) — the haunted front desk
   where deals are created, tracked and demoed.
4. **Kiro spec-driven development** — requirements → design → tasks, plus
   steering, hooks and a custom agent, all in `/.kiro`.

The contract is the source of truth for money. The agent is the source
of truth for "was the work delivered?". The web app is the source of
truth for nothing — it only renders state and drives the other two, plus
a local demo simulation for judges without a wallet.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  web/  Next.js 15 (App Router, TS, plain CSS)           │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Deals UI │  │ Keeper panel │  │ Demo mode (local) │  │
│  │ (list /  │  │ (verdict +   │  │ (simulated chain  │  │
│  │  detail) │  │  check list) │  │  state, no wallet)│  │
│  └────┬─────┘  └──────┬───────┘  └───────────────────┘  │
│       │               │                                  │
│       │  ethers v6    │  fetch / node:crypto             │
│       ▼               ▼                                  │
│  ┌────────────────┐  ┌────────────────────────────────┐  │
│  │ contracts/     │  │ agent/  keeper.ts              │  │
│  │ HauntedEscrow  │  │  reachability, hash, GitHub,   │  │
│  │ .sol (Foundry) │  │  scoring, verdict + reasons    │  │
│  └────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Deal state machine

```
SEALED ──fund()──▶ BURIED ──submitEvidence()──▶ EXHUMED
  │                  │                              │
  │                  │ timeout                      │ keeper verdict
  │                  ▼                              ├─ RELEASE ─▶ RELEASED
  └─cancel()──▶ CANCELLED   refund() ◀─────────────┤
                                                    ├─ REFUND ─▶ LAID_TO_REST
                                                    └─ DISPUTE ─▶ DISPUTED ──settle()──▶ SETTLED
```

States are stored on-chain as an enum; the UI maps each to a
plain-language label and a spooky icon.

### Smart contract — `contracts/src/HauntedEscrow.sol`

Native-BNB escrow (no token dependency, keeps the audit surface small).

- `createDeal(address seller, uint256 deadline, string description) payable`
  — buyer sends the amount with the call; deal starts `BURIED` directly
  (creation + funding are one step on-chain; the UI splits them into two
  steps for clarity and maps "create" to an unfunded draft stored locally
  until funded).
- `submitEvidence(uint256 dealId, string url, bytes32 contentHash)` —
  seller only, `BURIED` only; moves to `EXHUMED`; emits `EvidenceSubmitted`.
- `submitVerdict(uint256 dealId, Verdict verdict, string reasons)` —
  Keeper only (role = `keeper` address set at deploy; transferable by
  owner). `RELEASE` pays seller, `REFUND` pays buyer, `DISPUTE` freezes.
- `settle(uint256 dealId, uint256 sellerShareBps)` — `DISPUTED` only;
  requires both parties to have approved the same split (two-step:
  `proposeSettlement` by either party, `acceptSettlement` by the other).
- `timeoutRefund(uint256 dealId)` — buyer only, after deadline, `BURIED`
  only.
- `cancel(uint256 dealId)` — buyer only, `SEALED` only (unfunded draft).
- Events for every transition. No owner backdoor over funds; the owner
  can only rotate the Keeper address.

Security notes: checks-effects-interactions everywhere; reentrancy guard
on all fund-moving functions; no delegatecall; no selfdestruct; amounts
in wei, exact-value funding enforced (`msg.value` must equal the agreed
amount for the funding path used by the UI's two-step flow — see
`fundDeal` below).

To keep the UI's two-step create-then-fund flow honest on-chain, the
contract exposes both paths:

- `createDeal(...) payable` — create + fund atomically (used by the
  "Fund now" button).
- `createDraft(...)` + `fundDeal(uint256 dealId) payable` — draft is
  `SEALED` (unfunded), funding moves it to `BURIED`.

### Keeper agent — `agent/src/keeper.ts`

Pure TypeScript, no network calls to any LLM. The agent runs a pipeline
of evidence checks, each returning `{ name, passed, detail, weight }`:

1. **reachability** — `HEAD`/`GET` the evidence URL (5 s timeout).
   Fails closed on network error.
2. **integrity** — fetch content, SHA-256 it, compare with the seller's
   claimed hash. Exact match required.
3. **github** — if the URL is a github.com repo URL, check the public
   repo API (`https://api.github.com/repos/<owner>/<repo>`) exists and
   is not private/forked-empty. Skipped (neutral) for non-GitHub URLs.
4. **freshness** — if the URL serves a `Last-Modified` header, the
   content must be newer than the deal creation time (catches "link to
   an old thing" tricks). Neutral when the header is absent.
5. **lateness** — evidence submitted after the deadline caps the score.

Scoring: weighted sum of passed checks (weights: integrity 0.45,
reachability 0.25, github 0.15, freshness 0.15). Verdict thresholds:

- score >= 0.8 and integrity passed → `RELEASE`
- score <= 0.4 or integrity failed → `REFUND`
- otherwise → `DISPUTE`

The verdict object always includes the per-check report, the score, the
threshold applied, and a one-line Keeper quip (flavour text only — the
numbers decide, the quip does not).

### Web app — `web/`

Next.js 15 App Router, TypeScript, no CSS framework (hand-rolled
`globals.css`, crypt theme). Routes:

- `/` — landing: what the Keeper is, how a deal works, "Open a deal"
  CTA, live deal list (demo data in demo mode).
- `/deals/new` — create-deal form (seller, amount, deadline, description).
- `/deals/[id]` — deal detail: state timeline, evidence form (seller),
  "Ask the Keeper" button (runs the agent), verdict panel with
  check-by-check reasons, release/refund/settle actions.
- Demo mode: a toggle in the header. ON = all state in `localStorage`,
  a seeded set of demo deals, the agent runs against the live internet
  (fetch from the browser is CORS-limited, so in demo mode the agent
  runs through a Next.js route handler `/api/verdict` — server-side
  fetch, same `keeper.ts` code). OFF = "connect wallet" placeholder
  explaining testnet deployment is a post-hackathon step (no mainnet,
  no real funds during the hackathon).

API routes: `/api/verdict` (POST `{ url, claimedHash, dealCreatedAt,
deadline }` → verdict JSON). The route handler imports the shared
agent code so the demo and the real path use identical logic.

### Testing strategy

- **Contracts:** Foundry `forge test` — full state-machine coverage:
  create/fund, double-fund revert, wrong-amount revert, non-seller
  evidence revert, verdict release/refund/dispute flows, settlement
  split, timeout refund, reentrancy attempt (via a malicious test
  contract), Keeper-role rotation.
- **Agent:** Node's built-in `node:test` runner, no test framework
  dependency. Tests use a local HTTP server fixture (no live internet
  in tests) covering: hash match/mismatch, unreachable URL, GitHub
  URL handling, lateness cap, threshold boundaries (0.8 / 0.4).
- **Web:** `next build` + `next lint` green; a Playwright-free
  smoke check via `next start` + curl of `/` and `/deals/new`.
- **Kiro hooks:** `lint-on-save` (ESLint on TS/TSX saves),
  `test-on-save` (run the agent unit tests when `agent/` changes),
  `contract-guard` (PreToolUse gate: block `forge` deploy commands
  to mainnet; only testnet/local allowed).

## Decisions

| Decision | Rationale |
|---|---|
| Native BNB escrow, no ERC-20 | Smallest audit surface; no token-approval footguns for judges. |
| Deterministic agent, no LLM API | No API keys, no cost, no flaky network dependency; verdicts are reproducible and explainable — a feature, not a limitation. |
| Demo mode via localStorage + `/api/verdict` | Judges can evaluate in < 1 min with no wallet. |
| Next.js, no CSS framework | Fewer deps, faster cold build, full control of the spooky theme. |
| Foundry for contracts | `forge test` is fast and the author's existing toolchain. |
| Single repo, three packages | One public repo = one Devpost submission; clear separation of concerns. |

## Non-goals

- No mainnet deployment during the hackathon (testnet deploy is a
  documented follow-up; the contract is written to be deployable on
  BSC testnet as-is).
- No real-money flows, no custodial accounts, no user login.
- No LLM integration — the Keeper's "AI" is a transparent rules
  engine; this is disclosed everywhere, including the Devpost write-up.
