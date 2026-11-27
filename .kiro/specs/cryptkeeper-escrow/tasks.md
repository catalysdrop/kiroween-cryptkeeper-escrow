# Implementation Tasks — CryptKeeper Escrow

> Kiro spec task list. Status is updated as work lands.
> Legend: `- [ ]` pending · `- [~]` in progress · `- [x]` done.

## Wave 1 — Foundations (no dependencies)

- [x] 1. Scaffold repo: `README.md`, `LICENSE` (MIT), `.gitignore`
      (must NOT ignore `/.kiro`), `KIRO-USAGE.md`, `DEMO-SCRIPT.md`.
- [x] 2. Write Kiro steering: `.kiro/steering/product.md`,
      `tech.md`, `structure.md`, `security.md`.
- [x] 3. Write Kiro hooks: `.kiro/hooks/lint-on-save.json`,
      `test-on-save.json`, `contract-guard.json` (schema v1, verified
      against kiro.dev/docs/hooks).
- [x] 4. Write custom agent: `.kiro/agents/crypt-keeper.json`
      (Keeper persona + steering resources).
- [x] 5. Write MCP settings: `.kiro/settings/mcp.json`.

## Wave 2 — Smart contract (depends on 1)

- [x] 6. Scaffold Foundry project in `contracts/` (`forge init`
      layout, no template deps).
- [x] 7. Implement `HauntedEscrow.sol`: states, `createDraft`,
      `fundDeal`, `createDeal`, `submitEvidence`, `submitVerdict`
      (Keeper role), `proposeSettlement`/`acceptSettlement`,
      `timeoutRefund`, `cancel`, events, reentrancy guard.
- [x] 8. Write Foundry tests: happy paths + all revert cases +
      reentrancy attempt + settlement split + timeout refund.
- [x] 9. Run `forge test` — must be green; `forge build` clean.
      (23/23 green, 27 Nov 2026.)

## Wave 3 — Keeper agent (depends on 1)

- [x] 10. Implement `agent/src/keeper.ts`: checks (reachability,
      integrity, github, freshness, lateness), weighted scoring,
      verdict thresholds, per-check report.
- [x] 11. Implement `agent/src/types.ts` (shared types) and
      `agent/src/index.ts` (exports).
- [x] 12. Write `agent/test/keeper.test.ts` with a local HTTP fixture
      server (node:test, no live internet in tests).
- [x] 13. Run agent tests — must be green; verify threshold
      boundaries (0.8 / 0.4) explicitly. (13/13 green, 27 Nov 2026.)

## Wave 4 — Web app (depends on 1, 10)

- [x] 14. Scaffold Next.js 15 app in `web/` (App Router, TS,
      hand-rolled CSS, crypt theme).
- [x] 15. Implement routes: `/` (landing + deal list), `/deals/new`,
      `/deals/[id]` (timeline, evidence form, verdict panel).
- [x] 16. Implement demo mode: localStorage deal store, seeded demo
      deals, clear "simulation" labelling.
- [x] 17. Implement `/api/verdict` route handler reusing `agent/`
      code (server-side fetch; same logic as the real path).
- [x] 18. Implement wallet/testnet placeholder panel (honest: no
      mainnet, testnet deploy is a documented follow-up).
- [x] 19. Run `next build` + `next lint` — must be green; smoke-test
      `/` and `/deals/new` over HTTP. (Build green, lint clean,
      `/` + `/deals/new` 200; `/api/verdict` returns a well-formed
      verdict — REFUND/fail-closed in this sandbox because Node fetch
      cannot reach the public internet here; see KIRO-USAGE/README
      notes. On a normal host the live fetch works.)

## Wave 5 — Docs, demo, ship (depends on 9, 13, 19)

- [x] 20. Write `DEMO-SCRIPT.md` (< 3 min video outline, shot list,
      narration).
- [x] 21. Write `KIRO-USAGE.md` (honest Kiro status: CLI installed,
      auth state, what the artifacts are, how to complete the Kiro
      loop with `kiro-cli login`).
- [x] 22. Final README polish (screenshots section, how to run each
      package, disclosure of reused patterns).
- [x] 23. Commit + push to `catalysdrop/kiroween-cryptkeeper-escrow`
      (public), verify `/.kiro` is present on GitHub. (Commit
      78c69c6, verified live on GitHub 27 Nov 2026: public, MIT,
      `/.kiro` at root; demo evidence hash matches the live raw file.)
- [x] 24. Handoff doc for the parent agent (repo, commit, concept,
      category, Kiro status, what's left: Devpost form + video).
