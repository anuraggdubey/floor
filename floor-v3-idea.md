# Floor v4: Break the Peg (NEAR HACKATHON idea brief)

Agent: this replaces v3. Read `near-hackathon-brief.md` (rules) and `floor-demo-script.md` (the video) too. Build steps are in `floor-build-guide.md`. Nothing here is guaranteed to win. Attack it, then build it.

## 1. One line
A NEAR-native depeg-cover market you can break live: dump a stablecoin pool on NEAR, watch solvers reprice and withdraw, watch a late buyer get blocked on-chain, then watch the cover pay out automatically, ending with a payout that lands on a chain NEAR does not live on.

## 2. Why this and not another idea
- The hackathon has 396 public submissions as of 2026-11-10 (read from nearhackathon.com `/api/projects`, names and tracks only). 192 are Security and 187 are Agents, with dozens of near-identical "Guard / Leash / Allowance" projects. DeFi has 63 and none is depeg cover.
- Pooled crypto cover has a poor record and a capital problem. Competing solvers who back each policy with their own locked margin removes the shared pool and the guessed premium formula.
- Pitch line: "Intents for risk. NEAR shows competing solvers beat pools for swaps. Floor applies the same primitive to a payoff."

## 3. Core rule: NEAR is the product, other chains are the reach
| Layer | Where it lives |
|---|---|
| Stablecoin under test (the peg you break) | NEAR testnet contract (`peg-pool`) |
| Demo money (premiums, margin, payouts) | NEAR testnet NEP-141 token `fusdc` |
| Policies, solver margin, state gate, trigger, payout | NEAR testnet contract (`floor`) |
| Solver quotes | ed25519-signed, verified inside the NEAR contract |
| Payout to the holder | NEAR NEP-141 transfer first, always |
| Climax: payout on an EVM chain | NEAR Chain Signatures, ONE chain, optional layer (fallback: the NEAR payout alone) |
| Cross-chain premium display | Intents 1Click `dry:true` quote, display only, cut first if short on time |
Nothing in the core path depends on an EVM chain, an off-chain oracle, or a database.

## 4. The three features (build these three perfectly, nothing else)
**F1. Break the Peg.** A `peg-pool` contract holds a stable pair (demo stable `dUSD` vs `fusdc`). Anyone presses Dump or Buy; each press is a real NEAR transaction that moves the on-chain price. A scripted arbitrage bot slowly restores the peg so every run ends. Live price chart with tier lines. Because Floor reads the pool on-chain, there is no oracle role and no replay trick.
**F2. The cover market.** A holder asks for cover (amount, tenor, tiers). Three deterministic solver bots read the live pool price and quote; quotes widen as the price drifts and one pulls out under stress. The holder buys the best quote; the contract verifies the solver's signature, locks that solver's margin for this policy only, and applies the state gate: price in band at purchase and activation, lookback with no breach, wait before activation. After a sustained breach the contract pays the holder in `fusdc` on NEAR with no claim step. A late buyer is rejected on-chain (`GATE_CLOSED`).
**F3. Payout on another chain.** On trigger, the contract also builds a USDC transfer for the holder's EVM address and asks the NEAR MPC signer (Chain Signatures) to sign it; the executor broadcasts and the explorer link is shown. Contract-side checks (Design A in the build guide) mean the executor cannot redirect funds. If this spike fails, ship F1+F2 and say so; the demo still works.

## 5. What is deliberately cut
Postgres, better-auth, NEAR Connect wallet flow (P2), gasless relayer, three EVM chains, underwriter-builder UI, live Pyth oracle, replay engine, simulation clock, Playwright, LLM-driven solvers, Intents execution, pooled-capital sims. Each of these is a place to lose a day and none carries the demo.

## 6. Why judges should like it
- **AI screeners (Claude Code, Codex):** `make verify` runs contract unit tests and a full-lifecycle sandbox test offline with no secrets; `make dry` runs the whole app against a local NEAR sandbox; `docs/CLAIMS.md` maps every claim to a command, an expected output and a status (live / testnet / simulated); real testnet tx hashes are committed in `docs/evidence/`.
- **Humans:** the demo is a game you can play, the trigger is trust-minimised and attackable on purpose, the problem is one sentence, and the weaknesses are in the README.
- **Track fit:** `defi` (main), `open`. Add `agents` only if the solver bots genuinely run as separate NEAR accounts with their own margin (they do in this design); the human decides.

## 7. Honest weaknesses (README must say these)
- The peg under test is a demo stable on a demo pool, not USDC. The real USDC depeg of March 2023 is used only as a labelled historical hook.
- Solvers are scripted. NEAR's docs describe its shared quote bus for swaps and do not say it supports risk quotes or outside solvers; Floor runs its own quote bus. Never claim NEAR's existing solvers underwrite cover.
- Fully collateralised per-policy margin is capital-heavy for solvers; fixed partial payouts do not cover a total collapse (UST).
- The trigger polls the pool; a poke must land inside the sustain window. Anyone can poke. A TWAP is the next hardening step.
- Chain Signatures payout is outbound-only; the broadcast and confirmation come from a trusted executor. The MPC committee is a trust assumption; keep balances small.
- Testnet only, demo credits, guest accounts are custodial. Intents has no testnet. Framed as a risk-market prototype, not regulated insurance.
- Crypto cover has failed before; this prototype does not prove demand.

## 8. Unverified; spike first (go / no-go)
1. Contract-initiated `sign` on `v1.signer-prod.testnet` producing a valid EVM signature, on one chain. Docs I found show account-initiated examples; contract-initiated with an in-contract transaction hash is unproven.
2. Node count and threshold of the current signer (a docs page said 8 nodes; the earlier notes said 17 with threshold 11). Use what the docs say now.
3. NEP-141 token plus `ft_transfer_call` flow and storage registration for holders, from the current near-sdk docs.
4. Circle test USDC address and faucet for the chosen EVM testnet, from Circle's docs, not from memory.
5. Whether the contract can keccak and RLP-encode an EIP-1559 transaction within gas, or whether the omni-transaction library is better.
6. Local sandbox (near-workspaces or near-sandbox) can run the whole app for `make dry`.
7. Re-check nearhackathon.com for new depeg or risk-RFQ submissions before the deadline.

## 9. Odds, honestly
My judgment, not data: about 15-25% for a top-3 DeFi finish if the live demo lands and F3 works, about 2-5% for the grand prize. The edge is an unoccupied DeFi niche plus a demo people can play. The risks are F3 failing and polish running out.
