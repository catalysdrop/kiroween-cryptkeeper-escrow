# Requirements — CryptKeeper Escrow

> Spec for the Kiroween 2026 hackathon entry (Frankenstein category).
> Built 27 Nov 2026. Project started 27 Nov 2026 (inside the Kiroween
> submission period, 30 Oct – 4 Dec 2026). All code in this repo is new;
> design patterns only are reused from the author's earlier escrow work
> (disclosed in README).

## Introduction

Freelance and bounty deals between strangers fail in two familiar ways:
the buyer pays and gets nothing, or the seller delivers and never gets
paid. CryptKeeper Escrow is a haunted escrow desk: an AI agent — the
Crypt Keeper — guards every deal. The buyer locks payment in a smart
contract, the seller submits delivery evidence, and the Keeper verifies
that evidence before the contract releases the money. If the evidence
fails, the money goes back. No human middleman, no trust required.

The Halloween twist is not decoration only: the Keeper is a character
(a grave-keeper who "digs up the truth"), the UI is a spooky crypt, and
every deal state is a stage of a haunting — Sealed, Buried, Exhumed,
Released, or Laid to Rest (refunded).

## Glossary

- **Deal** — one escrow agreement: buyer, seller, amount, deadline, delivery evidence.
- **Keeper** — the AI verification agent that checks delivery evidence and issues a verdict.
- **Verdict** — `RELEASE`, `REFUND`, or `DISPUTE` (needs a human), with reasons and a confidence score.
- **Evidence** — a URL plus a SHA-256 content hash the seller claims matches the delivered work.
- **Demo mode** — an in-browser simulation of the whole flow (no wallet, no chain) so judges can click through in seconds.

## Requirements

### Requirement 1 — Create a deal

**User Story:** As a buyer, I want to open an escrow deal with a seller,
so that my payment is locked until delivery is verified.

#### Acceptance Criteria

1. WHEN a buyer fills in seller address, amount (BNB), deadline and a short description THEN the system SHALL create a deal in state `SEALED` with a unique id.
2. WHEN a deal is created THEN the system SHALL record buyer, seller, amount, deadline and description, and SHALL show the deal in the deal list.
3. WHEN any required field is missing or the amount is <= 0 THEN the system SHALL reject the deal with a clear error message.

### Requirement 2 — Fund the escrow (on-chain)

**User Story:** As a buyer, I want to lock the agreed amount in a smart
contract, so the seller can trust the money exists.

#### Acceptance Criteria

1. WHEN a buyer funds a `SEALED` deal with exactly the agreed amount THEN the contract SHALL hold the funds and the deal SHALL move to `BURIED` (funded).
2. WHEN funding is attempted with the wrong amount THEN the contract SHALL revert and no funds SHALL move.
3. WHEN funding is attempted by anyone other than the buyer THEN the contract SHALL revert.
4. WHEN a deal is already funded THEN a second funding attempt SHALL revert.

### Requirement 3 — Submit delivery evidence

**User Story:** As a seller, I want to submit proof of delivery, so the
Keeper can verify my work and release payment.

#### Acceptance Criteria

1. WHEN the seller of a `BURIED` deal submits a URL and a SHA-256 hash THEN the deal SHALL move to `EXHUMED` (awaiting verdict) and the evidence SHALL be recorded on-chain (URL + hash).
2. WHEN anyone other than the seller submits evidence THEN the contract SHALL revert.
3. WHEN evidence is submitted for a deal that is not `BURIED` THEN the contract SHALL revert.
4. WHEN evidence is submitted after the deadline THEN the deal SHALL be marked late and the Keeper SHALL weigh lateness in its verdict.

### Requirement 4 — Keeper verifies the delivery

**User Story:** As a buyer, I want an impartial agent to check the
delivery, so I pay only for real work.

#### Acceptance Criteria

1. WHEN evidence is submitted THEN the Keeper SHALL fetch the URL, hash its content, and compare the hash with the seller's claimed hash.
2. WHEN the URL is unreachable THEN the Keeper SHALL record a failed reachability check and lower the delivery score.
3. WHEN the content hash matches the claimed hash THEN the Keeper SHALL record a passed integrity check.
4. WHEN the evidence is a GitHub URL THEN the Keeper SHALL additionally check that the repository exists and is public.
5. WHEN all checks pass above their thresholds THEN the Keeper SHALL issue verdict `RELEASE` with reasons and a confidence score >= 0.8.
6. WHEN checks fail decisively THEN the Keeper SHALL issue verdict `REFUND` with reasons.
7. WHEN the evidence is ambiguous THEN the Keeper SHALL issue verdict `DISPUTE` and SHALL NOT move funds.
8. WHEN a verdict is issued THEN the system SHALL store the full check-by-check report so a human can audit it.

### Requirement 5 — Release or refund

**User Story:** As a participant, I want the contract to move money only
on a clear verdict, so neither side can steal the funds.

#### Acceptance Criteria

1. WHEN the Keeper issues `RELEASE` THEN the contract SHALL pay the seller the full amount and the deal SHALL move to `RELEASED`.
2. WHEN the Keeper issues `REFUND` THEN the contract SHALL return the full amount to the buyer and the deal SHALL move to `LAID_TO_REST`.
3. WHEN the verdict is `DISPUTE` THEN the contract SHALL hold the funds and the deal SHALL move to `DISPUTED`.
4. WHEN a deal is `DISPUTED` THEN the buyer and seller SHALL be able to agree on a split (release X% / refund the rest) via a mutual-settlement call.
5. WHEN the deadline passes with no evidence THEN the buyer SHALL be able to reclaim the funds (timeout refund).
6. WHEN funds have already moved (released or refunded) THEN any further release/refund call SHALL revert.

### Requirement 6 — Demo mode (no wallet needed)

**User Story:** As a judge, I want to click through the whole flow in
the browser without a wallet, so I can evaluate the app in under a
minute.

#### Acceptance Criteria

1. WHEN demo mode is on THEN the app SHALL simulate the contract states locally and SHALL NOT require a wallet or network.
2. WHEN a user completes the demo flow THEN they SHALL see every deal state: `SEALED` → `BURIED` → `EXHUMED` → `RELEASED` (and the refund path on a bad evidence link).
3. WHEN demo mode is on THEN the UI SHALL label it clearly as a simulation.

### Requirement 7 — Spooky, usable UI

**User Story:** As a user, I want a memorable Halloween-themed interface
that is still easy to use, so the theme strengthens rather than hides
the function.

#### Acceptance Criteria

1. WHEN the app loads THEN it SHALL show a dark crypt theme (deep purples/blacks, pumpkin orange accents, readable contrast).
2. WHEN a deal changes state THEN the UI SHALL show the state with a distinct icon and plain-language explanation.
3. WHEN a verdict is issued THEN the UI SHALL show the Keeper's reasons check-by-check, not just the outcome.

### Requirement 8 — Honest Kiro usage

**User Story:** As a judge, I want to see how Kiro was used, so I can
assess the Kiro implementation criterion fairly.

#### Acceptance Criteria

1. WHEN the repo is inspected THEN it SHALL contain `/.kiro` in its root with specs, steering, hooks and a custom agent.
2. WHEN the repo is inspected THEN `KIRO-USAGE.md` SHALL state plainly what Kiro did and did not do (including auth status of the Kiro CLI in the build environment).
3. WHEN the repo is inspected THEN `/.kiro` SHALL NOT be in `.gitignore`.
