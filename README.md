# 🪦 CryptKeeper Escrow

**A haunted AI-agent escrow desk — Kiroween 2026 hackathon entry
(Frankenstein category).**

A buyer locks payment in a smart-contract vault. A seller submits proof
of delivery. The **Crypt Keeper** — a deterministic AI verification
agent — digs up the truth and decides: release the gold, or send it
back to its owner. No human middleman. No trust required.

> Built 27–28 Nov 2026 for [Kiroween 2026](https://kiroween.devpost.com/)
> (submission period 30 Oct – 4 Dec 2026). The project is entirely new
> code, written during the submission period. Design patterns only are
> reused from the author's earlier escrow work — disclosed below.

## The Frankenstein mashup

Four technologies that do not normally share a room:

| Piece | Tech | Role |
|---|---|---|
| The Vault | Solidity + Foundry | Holds funds; moves them only on a verdict, a mutual settlement, a timeout refund, or a pre-funding cancel |
| The Keeper | TypeScript, zero dependencies | Verifies delivery evidence check-by-check and issues an explainable verdict |
| The Front Desk | Next.js 15 + React 19 | Haunted UI: create deals, track them, ask the Keeper — plus a no-wallet demo mode |
| The Method | Kiro specs / steering / hooks / custom agent | Spec-driven development; every artifact lives in `/.kiro` |

## How a deal works

```
SEALED ──fund──▶ BURIED ──submit evidence──▶ EXHUMED
  │                                            │
  └─cancel                                     │ Keeper verdict
                                               ├─ RELEASE ─▶ RELEASED (seller paid)
                                               ├─ REFUND  ─▶ LAID TO REST (buyer refunded)
                                               └─ DISPUTE ─▶ DISPUTED ──settle──▶ SETTLED
```

**The Keeper's checks** (all listed with their result in the UI):

1. **Reachability** — does the evidence URL answer? (weight 0.25)
2. **Integrity** — does the fetched content's SHA-256 match the seller's
   claimed hash? (weight 0.45 — decisive)
3. **GitHub** — for github.com links, does the repo exist and is it
   public? (weight 0.15, neutral for other URLs)
4. **Freshness** — is the content newer than the deal? (weight 0.15,
   neutral when no `Last-Modified` header)

Score ≥ **0.80** with integrity passed → `RELEASE`. Score ≤ **0.40** or
integrity failed → `REFUND`. Anything in between — or evidence submitted
after the deadline (score capped at 0.79) — → `DISPUTE`, funds frozen
until both sides agree a split. Every check that errors counts as
**failed** (fail closed). No LLM calls, no API keys, no black box: the
same code runs in the demo and in the on-chain flow.

## Try it in 60 seconds (no wallet)

```bash
npm install
npm run build --workspace=@cryptkeeper/agent
npm run build --workspace=cryptkeeper-web
npm run start --workspace=cryptkeeper-web   # http://localhost:3000
```

The app opens in **demo mode** with three seeded deals:

- **demo-1** — evidence already submitted. Click **Ask the Keeper** and
  watch it verify the delivery and release the payment.
- **demo-2** — funded, awaiting evidence. Use **Fill demo evidence
  (good)** for a release, or **Fill bad evidence** to see a refund.
- **demo-3** — an unfunded draft. Fund it, then run the flow yourself.

Demo state lives in your browser (`localStorage`); **Reset demo deals**
restores the seeds. Nothing here touches a real chain or real money.

## Run the pieces

```bash
# Smart contract tests (23 tests, Foundry)
cd contracts && forge test

# Keeper agent tests (13 tests, node:test — no live internet in tests)
npm test --workspace=@cryptkeeper/agent

# Web app
npm run build --workspace=cryptkeeper-web
npm run lint --workspace=cryptkeeper-web
```

## Repo layout

```
.kiro/                  # Kiro: specs, steering, hooks, custom agent
contracts/              # Foundry: HauntedEscrow.sol + tests
agent/                  # Keeper verification agent (TS, zero deps)
web/                    # Next.js app (App Router) + /api/verdict
DEMO-EVIDENCE.md        # Frozen delivery evidence for the seeded demo deal
KIRO-USAGE.md           # Honest statement of how Kiro was (and was not) used
DEMO-SCRIPT.md          # < 3 min demo video outline
```

## Disclosure (Kiroween rules)

- **New project:** all code in this repo was written 27 Nov 2026, inside
  the submission period. Nothing is copied from the author's earlier
  `agent-escrow` / `EscrowLens` projects; only the *concept* (escrow +
  agent verification) and general design patterns are reused, as the
  rules allow with disclosure.
- **Kiro usage:** see [`KIRO-USAGE.md`](KIRO-USAGE.md). In short: Kiro
  CLI 3.6.2 was installed and verified in the build environment, but it
  could not be authenticated there (login needs the author's Builder ID
  via a browser, or a `KIRO_API_KEY`). The `/.kiro` artifacts — spec
  (requirements/design/tasks), steering, hooks, custom agent — were
  authored in Kiro's documented formats and drove this build; the
  document explains exactly how to complete the loop with a logged-in
  Kiro session.
- **Starter code / libraries:** Next.js, React, ethers (address
  validation only), Foundry/forge-std (tests), TypeScript. No other
  starter template.
- **No mainnet:** the contract is written for testnet/local use. No
  real funds, no secrets, no user accounts in this repo.

## Security notes

- Checks-effects-interactions + inline reentrancy guard on every
  fund-moving function; exact-value funding only.
- The Keeper is a *role*, not an owner: it can issue verdicts but
  cannot change deal terms or move funds except through a verdict.
- The agent's fetcher only follows public http/https URLs (SSRF guard),
  caps redirects (3), body size (5 MB) and time (5 s).

## License

MIT — see [LICENSE](LICENSE).
