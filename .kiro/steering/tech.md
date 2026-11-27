---
inclusion: always
---

# Tech Stack — CryptKeeper Escrow

## Stack

- **Smart contracts:** Solidity ^0.8.24, Foundry (`forge test`, `forge build`).
  No external contract dependencies — the escrow is self-contained.
- **Agent:** TypeScript, Node 22, zero runtime dependencies.
  Uses only `node:crypto` (SHA-256) and the global `fetch`.
  Tests run on Node's built-in `node:test` runner.
- **Web:** Next.js 15 (App Router), React 19, TypeScript (strict).
  No CSS framework — hand-rolled CSS in `web/app/globals.css`.
  `ethers` v6 is used for address validation only in the UI.
- **Package manager:** npm. Each package has its own `package.json`.

## Commands

- Contracts: `cd contracts && forge test` / `forge build`
- Agent: `cd agent && npm test` (runs `node --test`)
- Web: `cd web && npm run build` / `npm run dev` / `npm run lint`

## Constraints

- No mainnet deployment, no real funds, no secrets in the repo.
- No paid APIs: the Keeper makes no LLM calls.
- Node >= 22, npm >= 10.
- TypeScript strict mode everywhere; no `any` without a comment
  explaining why.
