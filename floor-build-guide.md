# Floor v4: build guide (for the IDE agent)

Read `floor-v3-idea.md` (the idea, now v4) first, `floor-demo-script.md` second, and `near-hackathon-brief.md` for rules. Tags: **[VERIFY]** = not confirmed; check current docs or run a spike. If anything contradicts current docs, trust the docs and tell the human. Re-read https://nearhackathon.com/HACKATHON.md before submitting.

## 0. Agent rules (official; obey exactly)
NEVER without the human's explicit confirmation: send the submission (print the full JSON, one attempt only), post anything on X or any network, make the repo public or push or force-push, sign transactions that spend real tokens or deploy to mainnet, commit secrets.
Never invent: project name, team lead, email, team size, tracks, NEAR payout account, repo link, demo link, description, consent. Ask. Never create a NEAR account for the human's payout.
Always: look up addresses, endpoints and SDK versions in current docs; build on testnet; keys in `.env` only; write the README from day one for an AI judge (what it is, the problem, numbered "do X, see Y", no marketing). Docs index: https://docs.near.org/llms.txt and https://docs.near-intents.org/llms.txt. Setup: `npx skills add near/agent-skills`. Deprecated: `near-sdk-js`, old keyStores, old `@near-js/*` splits. Check with near-pedia MCP (https://near-pedia.xyz/mcp) if available.

## 1. Build principles (from winner advice and this hackathon's field)
1. **Two to three features, perfect.** F1 Break the Peg, F2 cover market, F3 cross-chain payout. Everything else is cut (list in idea doc section 5). If time is short, cut F3 first, then polish F1+F2.
2. **Script the demo before the code** (`floor-demo-script.md`). Every build decision serves a shot in that script.
3. **NEAR is the core.** All logic and money on NEAR testnet. EVM only for the F3 climax.
4. **Claim nothing that does not run.** Every claim goes in `docs/CLAIMS.md` with a command and expected output. Unverified items are labelled.
5. **Reproducible without secrets:** `make verify` (offline) and `make dry` (local sandbox). Pinned lockfile committed.
6. **No database.** Chain is the source of truth; the server keeps an in-memory event log rebuilt from RPC on restart.
7. **Hard-code nothing fake.** Label simulated pieces (scripted solvers, demo stable, demo credits) in the UI and README.

## 2. Stack (one repo, two processes)
- `contracts/` Rust, near-sdk 5.x (check latest in docs; run `rustup update stable`, use what `cargo near new` generates). Three crates: `fusdc` (NEP-141 demo money, faucet), `peg-pool` (the peg), `floor` (market).
- `apps/web` Next.js (App Router, TypeScript, Tailwind, Recharts), deployed as a Node server so SSE works. NEAR libs client-side only if used.
- `apps/worker` Node + TypeScript: solver bots, keeper (poke/activate/trigger/expire), arbitrage bot, payout executor, SSE stream. Can run as a second process in the same container.
- JS libs: `near-api-js` (current major), `chainsig.js` (F3), `viem` (F3 and address checks), `zod`. Pin versions, commit the lockfile (a past hackathon repo hit a `chainsig.js` ESM failure on Node 22 fixed by a lockfile).
- Deploy: web + worker on Railway or Fly or Render (one container is fine). Keep up through 2026-11-18, ideally 2026-11-25.
```
floor/
  README.md  LICENSE(MIT)  Makefile  .env.example  docker-compose.yml(optional)
  contracts/{fusdc,peg-pool,floor}/  (+ tests/)
  packages/shared/   canonical quote bytes, zod schemas, constants
  apps/web/  apps/worker/
  docs/{CLAIMS.md,evidence/,threat-model.md,spikes.md}
  scripts/  (create-accounts-checklist, fund, derive-address, e2e)
```

## 3. Testnet accounts (human creates; agent never invents)
`<you>-fusdc`, `<you>-pool`, `<you>-floor`, `<you>-keeper`, `<you>-solver-a/b/c`, `<you>-arb`, `<you>-guests` (parent of visitor accounts). Create with `near create-account ... --useFaucet`. Keys in `.env`. Guest keys are server-held and testnet-only, so full-access is acceptable there but must be disclosed as custodial; never for real funds. Mainnet payout account is the human's, needed only at submission.

## 4. Contracts

### 4.1 `fusdc` (NEP-141, 6 decimals)
Use `near-contract-standards` fungible token [VERIFY current crate usage]. Add `faucet()`: mints a small fixed amount per account per day, rate-limited. Premiums, margin and payouts are `fusdc`. Holders and solvers must be storage-registered (`storage_deposit`); the server registers guest accounts on creation. Production note for README: replace with real USDC.

### 4.2 `peg-pool` (F1)
Demo stable `dUSD` vs `fusdc` with internal balances (no extra FT plumbing). A simple invariant (constant-product or a stable-lite curve; pick what gives a smooth visible price move). Methods: `swap_sell_dusd(amount)` (dump: price falls), `swap_buy_dusd(amount)` (restores), `get_price_e8()` view, `credit_demo(account, amount)` rate-limited. Cap the single-swap size so no one empties the pool. Events for every swap. The arbitrage bot (worker) buys dUSD back slowly after a breach so each run ends and the peg recovers.
Price definition: price of 1 dUSD in `fusdc`, 8-decimal fixed point (`price_e8`; 1.00 = 100_000_000).

### 4.3 `floor` (F2 + F3)
State per asset (just `dUSD` in v1): `band_bps` (9950 = 0.995), tiers (e.g. 3% below 0.97, 8% below 0.93, 15% below 0.90), `sustain_secs`, `lookback_secs`, `wait_secs`, `stale_secs`, `exposure_cap`. Demo defaults (configurable by owner; put in `.env` and README): sustain 30s, lookback 120s, wait 20s, tenor up to 10 min. Time is block time (`env::block_timestamp`); there is no simulation clock.
Per-asset gate state, O(1): `last_out_of_band_ts`; per tier `start_ts`/`sustained_at`.
Methods:
- Admin: `new`, `set_params`, `set_roles(keeper)`, `set_chain(evm_chain_id, token_address, derivation_path, pool_address)` (F3).
- Solvers: `register_solver(pubkey)`; margin deposited via `ft_transfer_call` on `fusdc` (`ft_on_transfer` credits free margin); `withdraw_margin` (free margin only).
- `poke()` (anyone, keeper calls it every few seconds): cross-contract `peg-pool.get_price_e8`, callback `on_price` updates gate state: set `last_out_of_band_ts` if price below band; start/reset each tier's `start_ts`; mark `sustained_at` when `now - start_ts >= sustain_secs`; reject stale reads.
- Buy cover: holder calls `fusdc.ft_transfer_call(floor, premium, msg=SignedQuote)`. `ft_on_transfer` verifies: solver active and `env::ed25519_verify` over canonical bytes, quote not expired, nonce unused, gate open (price fresh, in band, `now - last_out_of_band_ts >= lookback`), exposure cap, solver free margin >= max payout, premium amount matches. Then credits premium to the solver, locks `max_payout` margin, creates the policy `Pending` with `activate_ts = now + wait`. Returns refund of any excess.
- `activate(id)` (anyone after `activate_ts`): `Void` (premium refunded, margin unlocked) if any out-of-band observation since creation or price out of band now; else `Active`.
- `trigger(id)` (anyone): policy `Active`, a tier is `sustained` within `[activate_ts, expires_ts]`; set `Triggered`; amount = notional * tier payout bps; pay holder via `fusdc.ft_transfer` from locked solver margin (1 yoctoNEAR); on callback mark `PaidOut`; on failure roll back to `Triggered` for retry. Create a `Payout` record for F3 if the holder gave an EVM address.
- `expire(id)` (anyone after `expires_ts`): unlock margin.
- Views: `get_params`, `get_asset_state`, `get_policy`, `list_policies`, `get_solver`, `list_solvers`, `pool_stats`.
- F3: `request_evm_payout(payout_id, tx_fields)` (executor role). See section 8.
- Emit NEP-297 style JSON events for every state change.

### 4.4 Quote canonical format (shared in `packages/shared`)
`floor-quote/v1|<rfq_id>|<solver>|<asset>|<holder>|<evm_addr_or_none>|<notional>|<tenor_secs>|<tiers_hash>|<premium>|<max_payout>|<expires_ts>|<nonce>` as UTF-8, signed ed25519 by the solver. Build the same bytes in TS and Rust; test with a fixed vector.

### 4.5 Invariants (a unit or sandbox test for each)
Margin ledger conserves (deposits - withdrawals - payouts = balances); `locked <= total`; one payout per policy; nonce reuse rejected; no policy creation while the gate is closed; `Void` always refunds and unlocks; exposure cap holds; time and `last_out_of_band_ts` never go backwards; a failed payout callback leaves the policy retryable, never lost; no panic inside callbacks that move state (roll back instead).

## 5. Worker (`apps/worker`)
1. **Keeper:** every ~5 s `poke`; call `activate` / `trigger` / `expire` for due policies.
2. **Solver bots (3, deterministic, seeded):** each has its own NEAR account, ed25519 key and funded margin. On an RFQ, read the live pool price and quote `(premium, max_payout, capacity)`. A: premium = base + k * recent deviation. B: fixed event-rate prior times payout, widens past a threshold. C: aggressive and thin, small capacity, pulls out when price drifts below a threshold. Quotes visibly move as the price falls.
3. **Quote bus:** in-memory; SSE `/stream/rfq/:id` with 30-60 s quote TTL.
4. **Arbitrage bot:** after a sustained breach, buys dUSD back in steps so the peg recovers.
5. **Payout executor (F3 only):** section 8.
6. **Health:** NEAR RPC, contract view, balances, keeper heartbeat; `/api/health`.
`DRY_RUN`: run the same code against a local sandbox (section 9).

## 6. Web app (`apps/web`)
One main screen, `/play`, laid out for the video (see `floor-demo-script.md`): live price chart with tier lines and gate-closed shading; quote board (3 solvers, premium, capacity, countdown, best badge, pulled-out state); big Dump / Buy buttons for the Break-the-Peg panel; policy timeline (Pending, Active, Triggered, Paid out) with explorer links; solver margin and pool solvency bars; payout panel (NEAR tx, then EVM tx). Plus `/` (landing with the hook and a Play button) and `/about` (how it works, what is live vs simulated, weaknesses).
UX rules: no wallet or gas words in the default flow; guest account created on first visit; label "testnet demo credits", "simulated solvers", "demo stable" wherever they apply; clear states for gate closed, no quotes, stale price, payout pending; dark theme, mobile-safe, fast. Per-IP rate limits on Dump and faucet.
API (zod-validated JSON, errors `{error:{code,message}}`): `POST /api/guest`, `GET /api/me`, `GET /api/params`, `POST /api/faucet`, `POST /api/peg/dump`, `POST /api/peg/buy`, `GET /api/price/stream` (SSE), `POST /api/rfq`, `GET /api/rfq/:id/stream` (SSE), `POST /api/policies` (server signs for the guest), `GET /api/policies/:id`, `GET /api/pool`, `GET /api/health`. NEAR Connect wallet login is P2; if added, client-side only and no promise of email login.

## 7. Auth
P0: server-held guest accounts under `<you>-guests.testnet` (custodial, testnet, disclosed). P2: NEAR Connect (`@hot-labs/near-connect`) plus NEP-413 verification, gasless via NEP-366 relayer whitelisting only the `floor` contract [VERIFY all current APIs; skip if time is short].

## 8. F3: Chain Signatures payout (one EVM chain, spike first)
Facts to confirm in current docs [VERIFY]: signer contract `v1.signer-prod.testnet` on testnet (`v1.signer` mainnet); ECDSA for EVM; outbound only; MPC node count and threshold; the `sign` request struct and response shape for the current signer version; yield timeout (about 200 blocks) and the fact that a signature can be published even if your callback fails.
Plan (Design A): the `floor` contract is the caller of `sign`, so only contract logic can request a signature.
1. Pick ONE EVM testnet where the spike works (Ethereum Sepolia first). Derive the pool address with `chainsig.js` using the contract account id and a fixed path. Fund it with test gas ETH and test USDC (Circle faucet; take the token address from Circle's docs).
2. Executor builds an EIP-1559 `USDC.transfer(to, amount)` (`to` = token address, value 0, data `0xa9059cbb` + padded recipient + padded amount), nonce from RPC.
3. `request_evm_payout(payout_id, tx_fields)`: contract checks payout is reserved and not yet requested, `to` equals the configured token, `data` decodes to the policy's EVM address and exact amount, `chain_id` matches, nonce is monotonic; computes keccak256 of the RLP-encoded typed transaction (small RLP encoder or the omni-transaction library, whichever works within gas [VERIFY]); calls `sign` with 1 yoctoNEAR and generous gas; `on_signed` stores the signature.
4. Executor converts to r/s/v, broadcasts with `viem`, calls `confirm_evm_payout(payout_id, tx_hash)`. One signature per payout id; retries reuse the same tx fields; never sign two different transactions for one payout.
Fallback (Design B, label it): executor supplies the hash and the contract trusts the executor role. Use only if Design A blocks you. Fallback of fallbacks: skip F3, ship NEAR payout only, say so.
Caps: small per-address and daily payout caps so the public demo cannot drain the test funds. The README states that confirmation of the EVM transfer is trusted.

## 9. Offline reproducibility (the AI-screener path)
- `make verify` (no secrets, no network): contract unit tests; a sandbox integration test (near-workspaces or `near-sandbox` [VERIFY which]) that runs the whole lifecycle: buy, gate-close, dump, sustain, trigger, NEAR payout; invariant tests; shared-package vector test for the canonical quote. Prints a list of PASS/FAIL lines.
- `make dry`: start a local NEAR sandbox, deploy the three contracts, start worker and web against it, with a stub signer for F3. Open `http://localhost:3000/play`, press Buy, press Dump, see the payout. No testnet, no keys.
- `make demo`: live testnet using `.env`.
Other targets: `make setup`, `make deploy` (testnet only), `make fund-checklist`.

## 10. Phases and go/no-go
**Phase 0 spikes (do first, record in `docs/spikes.md`):** S1 contract-initiated Chain Signatures signature on one EVM testnet (cut F3 if it fails); S2 NEP-141 `ft_transfer_call` + storage registration flow; S3 sandbox can run the lifecycle offline; S4 (optional) 1Click `dry:true` quote with an API key from https://partners.near-intents.org.
**Phase 1 contracts:** `fusdc`, `peg-pool`, `floor` core with all invariant tests. Done when the sandbox test runs buy to NEAR payout and `make verify` is green.
**Phase 2 worker:** keeper, three solvers, arb bot, SSE. Done when `make dry` shows the whole loop in a terminal log.
**Phase 3 web:** the `/play` screen exactly as the demo script needs it. Done when a stranger can open the hosted page, buy cover, press Dump and see a payout with no wallet.
**Phase 4 F3:** payout on one EVM chain with the explorer link and a retry that does not double-pay.
**Phase 5 evidence and submission:** `docs/CLAIMS.md`, committed testnet tx hashes in `docs/evidence/`, threat model, README, the video, the X post (human posts), submission payload printed for approval.

## 11. Security
Access control on admin/keeper/executor methods; checks-effects-interactions around promises; roll back on failed callbacks; overflow-safe math; per-address and per-IP rate limits; secrets only in `.env`; run `gitleaks` (or similar) over the full history before the repo goes public; zod on every route; CORS locked; SSE connection limits. Write `docs/threat-model.md` covering gate gaming, flash-spike trigger manipulation, solver risk, executor and MPC trust, faucet abuse.

## 12. README skeleton (for the AI screener; no marketing)
1. What it is (two sentences) and the problem.
2. Live / testnet / simulated table.
3. Prerequisites and `make setup`.
4. `make verify` and the PASS lines to expect.
5. `make dry`, then open `/play`: Buy cover, press Dump, see the gate block a late buyer, see the payout.
6. Live demo link and the same steps with your own address.
7. NEAR features used and where (table with file paths): own contracts, NEP-141, ed25519 verification, cross-contract calls and callbacks, Chain Signatures, Intents dry quote if shipped.
8. Known limitations and unverified items.
9. Libraries and AI assistance disclosed (Q-005); baseline vs hackathon work (Q-003/Q-004). A `docs/CLAIMS.md` link.
LICENSE (MIT). No secrets in history.

## 13. Submission (human confirms every step)
Fields: `requestId` (uuid, once), `projectName` (2-80), `leadName`, `email` (max 2 submissions per email), `size` (`1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`), `tracks` (suggest `defi` and `open`; add `agents` only if the human agrees and the solver accounts justify it), `nearAddress` (mainnet payout account, human's), `projectUrl` (public repo, unique), `demoUrl` (public X post), `idea` (20-2000 chars: problem, product, how NEAR fits), `consent` (true only after the human agrees). No other fields (`website` is a spam trap). Deadline 2026-11-14 23:59 UTC. Print the full payload and wait for a yes before POST to `https://nearhackathon.com/api/applications`. Edits afterwards only via https://nearhackathon.com/request-changes; never re-submit.
Pre-submit checklist: repo public with LICENSE; README steps work from a clean clone; no secrets in history; X post live with video, says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, explains NEAR's role concretely, links the live demo and repo, ends with a genuine question; hosted demo up; payout account ready.

## 14. Open questions (answer in `docs/spikes.md`)
Does the signer's `sign` request and response match the plan? Can the contract keccak and RLP-encode within gas? Does the sandbox run everything for `make dry`? What are the 1Click dry-quote limits (if used)? Is any new submission similar (re-check nearhackathon.com before submitting)?
