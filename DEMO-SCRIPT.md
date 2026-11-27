# Demo video script — CryptKeeper Escrow (< 3 min)

> Target: 2:30–2:45. Recorded screen capture + voiceover. No camera
> appearance required. No third-party music or trademarks.
> Record at 1280×720, browser zoom 100%, demo mode on.

## Shot list

| Time | Shot | Narration (EN) |
|---|---|---|
| 0:00–0:15 | Landing page, slow scroll over the 4 steps | "Freelance deals fail when strangers don't trust each other. CryptKeeper Escrow fixes that — with a haunted twist. A buyer locks payment in a smart contract, a seller proves delivery, and an AI agent called the Crypt Keeper decides who gets paid." |
| 0:15–0:35 | Click demo deal 1 (Exhumed), show evidence URL + hash | "Here's a deal: a landing page for a haunted bakery, half a BNB locked in the vault. The seller submitted a delivery link and its content hash." |
| 0:35–1:05 | Click **Ask the Keeper**; verdict panel appears, scroll the check list | "The Keeper fetches the link, hashes what it finds, and compares it with the claim. Reachability — pass. Hash match — pass. GitHub — not applicable. Freshness — pass. Score 1.0: RELEASE. Every check is listed, so anyone can audit the decision." |
| 1:05–1:25 | Deal shows Released; open demo deal 2, fill **bad evidence**, ask Keeper | "Now the other path. Same deal, bad evidence — the hash doesn't match. The Keeper refunds the buyer. Fail closed, every time." |
| 1:25–1:50 | Open a new deal (form), fund it | "Opening a deal takes seconds: describe the work, set the amount and deadline, fund it — and the gold is buried until delivery is proven." |
| 1:50–2:15 | Quick tour: contract file + `forge test` passing in terminal; agent test run | "Under the hood: a Solidity escrow with a strict state machine — 23 Foundry tests green — and a deterministic verification agent with 13 tests. No black box, no API keys." |
| 2:15–2:35 | Show `/.kiro` folder in the repo (specs, steering, hooks) | "And it was built spec-first with Kiro: requirements, design and tasks in /.kiro, plus steering docs, hooks, and a custom Keeper agent." |
| 2:35–2:45 | Landing page + GitHub URL on screen | "CryptKeeper Escrow — the Keeper digs up the truth, so you don't have to trust a stranger. Built for Kiroween 2026." |

## Recording notes

- Use the seeded demo deals; reset demo state before recording so
  deal 1 is Exhumed and deal 2 is Buried.
- The "Ask the Keeper" call needs internet from the machine running
  the web app (the agent fetches the evidence URL live). Record on a
  machine with normal internet access — in the author's sandbox, Node
  fetch is proxy-blocked and the Keeper correctly fail-closes to
  REFUND, which would show the wrong path on camera.
- Keep the terminal font large (16pt+) for the test-run shots.
- Export 1080p, upload to YouTube as Public, title:
  "CryptKeeper Escrow — haunted AI escrow (Kiroween 2026)".
