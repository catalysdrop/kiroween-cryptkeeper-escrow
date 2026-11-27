---
inclusion: always
---

# Structure — CryptKeeper Escrow

```
.
├── .kiro/                  # Kiro artifacts (NEVER gitignore this)
│   ├── specs/cryptkeeper-escrow/   # requirements.md, design.md, tasks.md
│   ├── steering/           # product.md, tech.md, structure.md, security.md
│   ├── hooks/              # *.json hook configs (schema v1)
│   ├── agents/             # custom agent configs
│   └── settings/mcp.json   # MCP server config
├── contracts/              # Foundry project
│   ├── src/HauntedEscrow.sol
│   └── test/HauntedEscrow.t.sol
├── agent/                  # Keeper verification agent (TS, zero deps)
│   ├── src/keeper.ts       # checks + scoring + verdict
│   ├── src/types.ts
│   ├── src/index.ts
│   └── test/keeper.test.ts
├── web/                    # Next.js app
│   ├── app/                # routes: /, /deals/new, /deals/[id]
│   ├── app/api/verdict/    # route handler (server-side agent run)
│   ├── lib/                # demo store, formatting, contract ABI
│   └── app/globals.css     # crypt theme
├── README.md
├── KIRO-USAGE.md           # honest statement of Kiro usage
├── DEMO-SCRIPT.md          # < 3 min video outline
└── LICENSE                 # MIT
```

## Conventions

- TypeScript: `PascalCase` types, `camelCase` functions/variables,
  `SCREAMING_SNAKE` for constants. Prefer explicit return types on
  exported functions.
- Solidity: NatSpec on all public/external functions; state changes
  before external calls (checks-effects-interactions); events for
  every state transition.
- Tests live next to the code they test (`contracts/test/`,
  `agent/test/`). Every new check in the agent gets a test case.
- The agent package must stay dependency-free so the web route
  handler can import it without pulling a dependency tree.
