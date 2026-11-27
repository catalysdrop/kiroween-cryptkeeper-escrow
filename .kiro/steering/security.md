---
inclusion: always
---

# Security — CryptKeeper Escrow

## Rules (non-negotiable)

1. **Never move real funds.** No mainnet deployment, no mainnet RPC,
   no private keys in this repo — ever. The contract is written for
   testnet/local use during the hackathon.
2. **Checks-effects-interactions** in every Solidity function that
   moves funds. Reentrancy guard on `fundDeal`, `submitVerdict`,
   `acceptSettlement`, `timeoutRefund`.
3. **Exact-value funding:** the contract accepts only `msg.value`
   equal to the agreed amount. No over/under-payment.
4. **Keeper is a role, not an owner:** the Keeper address can issue
   verdicts but cannot move funds except through a verdict, and
   cannot change deal terms. Only the deployer can rotate the Keeper.
5. **Agent fails closed:** any check that errors (network timeout,
   unparsable response) counts as failed, never as passed.
6. **No secrets in code or docs:** no API keys, no mnemonics, no
   wallet addresses belonging to real users. Demo addresses are
   clearly labelled as fake.
7. **Input validation at every boundary:** addresses validated with
   `ethers.isAddress`, URLs validated (http/https only, no
   `file:`/`javascript:` schemes), hashes must be 64 hex chars.
8. **SSRF hygiene in the agent:** the evidence fetcher only follows
   http/https URLs, caps redirects at 3, caps body size at 5 MB,
   times out at 5 s, and never fetches `localhost`/private ranges.
