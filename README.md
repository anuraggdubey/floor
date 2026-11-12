# Floor

**Stablecoin depeg cover that pays itself.** AI underwriters compete to back your cover with their own locked margin. NEAR contracts enforce the rules and pay you automatically when the peg breaks: no claim form, no committee. Built for **NEAR HACKATHON 2026**.

> In March 2023 USDC fell to about $0.87 and holders had no cover they could buy in time. Pooled crypto cover has stayed small because capital is scarce and risk is hard to price. Floor makes underwriting a live competition and puts the enforcement in contracts.

| | |
|---|---|
| **Live demo** | https://floorxa.vercel.app |
| **Demo video (2:19)** | ADD_VIDEO_URL |
| **Demo post on X** | ADD_X_POST_URL |
| **Network** | NEAR testnet (+ Ethereum Sepolia for the cross-chain payout) |
| **Tracks** | Unstoppable DeFi (main), Open Innovation, Agent Economy |

## What you can do in 2 minutes
1. Open the live demo and press **Watch it happen**, or do it yourself in `/play`.
2. **Get an account** in one click (a real NEAR testnet account, funded with demo credits).
3. **Get quotes.** Three AI underwriters read the live pool price, write their reasoning and return signed quotes.
4. **Buy cover.** The contract verifies the quote signature and locks that underwriter's margin for your policy.
5. **Break the peg.** Press 25k three times. Each dump is a real NEAR transaction that moves the pool price.
6. Watch the gate close (a late buyer is refused on-chain with `GATE_CLOSED`), the price stay under a payout line, and the contract **pay you in fUSDC**. Every step links to the NEAR explorer.
7. Optional: register an Ethereum address and the contract also pays real **USDC on Ethereum Sepolia** through NEAR Chain Signatures.

Also try **`/time-machine`**: the real March 2023 USDC/USDT crash (Binance 15-minute candles) replayed against the same market, with the AI underwriters pricing and refusing it, and a backtested cover paying out. It is a simulation on real data; no transaction is made.

## How it works
```
 holder ──RFQ──▶ worker ──▶ 3 AI underwriters (own NEAR accounts, own margin, own ed25519 quote keys)
                                │ signed quotes
 holder ◀── best quote ─────────┘
 holder ──ft_transfer_call(premium + quote)──▶ floor contract
                                │ verifies the ed25519 signature, applies the state gate,
                                │ locks that underwriter's margin for this policy only
 peg-pool (dumpable demo stable) ──price──▶ floor contract: breach tracking per tier
 price stays under a tier line for sustain_secs (+ settle_secs) ──▶ anyone calls trigger()
                                │ pays the holder in fUSDC from the locked margin
                                └─ optional: asks the NEAR MPC signer to sign a USDC transfer on Ethereum Sepolia
```
- **State gate:** price must be in band at purchase and activation, with a lookback that shows no breach and a wait before activation. A late buyer is refused on-chain and refunded.
- **Sustained breach:** a flash dump that recovers pays nothing. A settlement delay stops anyone locking a payout at the shallowest tier by triggering early.
- **Solvers:** each is a separate NEAR account. If an LLM answer is slow or unusable, the scripted strategy answers instead and the offer is labelled `scripted`. The model only chooses a premium rate (clamped to hard bounds); the contract, not the model, decides everything that moves money.

## NEAR features used
| Feature | Where |
|---|---|
| Own contracts in Rust (near-sdk 5) | [`contracts/`](contracts): `fusdc`, `peg-pool`, `floor` |
| NEP-141 token, `ft_transfer_call` / `ft_on_transfer` | premiums, margin deposits and refunds |
| `env::ed25519_verify` for solver-signed quotes | `floor` rejects forged and replayed quotes |
| Cross-contract calls and callbacks | price reads, payouts, retry on failure |
| **Chain Signatures (MPC)** | `floor` builds an EVM USDC transfer itself and asks `v1.signer-prod.testnet` to sign it |
| Per-solver accounts and margins | autonomous underwriters with their own capital |

Deployed on testnet: `floorxa-fusdc.testnet`, `floorxa-pool.testnet`, `floorxa-floor.testnet`.

## What is real, simulated, or not built
| Piece | Status |
|---|---|
| Three contracts, lifecycle, invariants | **real**, deployed on testnet, unit and sandbox tested |
| Quote signing and verification | **real** (TypeScript signs, Rust verifies; shared test vector) |
| Payout on NEAR | **real**, verified on testnet end to end |
| USDC payout on Ethereum Sepolia via Chain Signatures | **real**, tx [`0x22fe0094…5b03`](https://sepolia.etherscan.io/tx/0x22fe00940d020c6b0f776445ed102c478e1a4b8bfcbc8425672306095c835b03) (see [`docs/evidence`](docs/evidence/f3-cross-chain-payout.md)) |
| AI underwriters (Groq LLM) | **real** when `GROQ_API_KEY` is set, otherwise scripted and labelled |
| Demo money (`fusdc`) and the stable under test (`dUSD`) | **simulated** demo assets, not real USDC |
| Time machine | **simulation** on real Binance price data |
| Guest accounts | **custodial, testnet only** |
| NEAR Intents | not built (no testnet exists) |

## Verify it yourself
Every claim in this README has a row in [`docs/CLAIMS.md`](docs/CLAIMS.md) with the command and the expected result.

| Check | Command | Expect |
|---|---|---|
| Contract unit tests | `cd contracts && cargo test -p fusdc -p peg-pool -p floor` | 6 + 10 + 51 pass |
| Full lifecycle in a local sandbox | `cd contracts && cargo test -p integration-tests -- --test-threads=1` | buy, dump, refuse, trigger, pay pass |
| Worker tests | `cd apps/worker && pnpm test` | 44 pass |
| Live testnet end to end | `make worker`, then `make e2e` (~4 min, needs `.env`) | `E2E ALL PASS`, 14 PASS lines |
| Cross-chain payout | `node scripts/e2e-evm.mjs` (needs the sender funded) | `EVM E2E ALL PASS` and an Etherscan link |

## Run it locally
Linux, macOS or WSL (Windows: use WSL). Needs Rust stable with `wasm32-unknown-unknown`, `cargo-near`, `near-cli-rs`, Node 24, pnpm 10, `make`.

```bash
make doctor          # every line should say PASS
make setup           # pnpm install
cp .env.example .env # fill it in: see docs/SETUP.md (testnet accounts and keys)
make worker          # terminal 1: keeper, solvers, arb bot, API on :8787
make web             # terminal 2: web app on :3000
```
Open http://localhost:3000 and go to `/play`. Without `GROQ_API_KEY` the solvers are scripted; with it they are LLM agents. To deploy it for free (Vercel + Render) see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Repository layout
```
contracts/    Rust NEAR contracts (fusdc, peg-pool, floor) and sandbox integration tests
apps/web      Next.js app: landing story, /play (the arena), /time-machine
apps/worker   price feed, keeper, AI/scripted solvers, arbitrage bot, EVM payout executor, HTTP API
docs/         SETUP, DEPLOY, CLAIMS, spikes, evidence/
scripts/      end-to-end and helper scripts
```

## Known limitations
- The peg under test is a demo stable on a demo pool, not USDC. The March 2023 depeg is used only as a labelled historical reference.
- Solvers are a scripted or LLM-driven demo, not a real underwriting desk. NEAR's shared quote bus is documented for swaps; Floor runs its own quote flow and does not claim NEAR's existing solvers underwrite cover.
- Cover is fully collateralised per policy (capital heavy for solvers); fixed partial payouts do not cover a total collapse.
- The trigger relies on pokes landing inside the sustain window; a TWAP is the next hardening step.
- The cross-chain payout is outbound only. The contract cannot read Ethereum, so confirmation comes from a trusted executor, and the MPC committee is a trust assumption. The EVM leg is capped at 5 USDC.
- Testnet only, demo credits, custodial guest accounts. Not regulated insurance, and this prototype does not prove demand.
- Open items are listed in [`docs/spikes.md`](docs/spikes.md).

## Hackathon disclosures
- **Event:** NEAR HACKATHON 2026 (build window 2026-11-01 to 2026-11-14). No pre-existing baseline code.
- **AI assistance:** Claude Code helped research, plan and write code and documentation. The AI underwriters call an LLM through the Groq API (model set by `GROQ_MODEL`). All claims are checked against `docs/CLAIMS.md`.
- **Third-party:** near-sdk, near-contract-standards, near-api-js, chainsig.js, viem, Next.js; see `package.json`, `pnpm-lock.yaml`, `Cargo.lock`. Price data for the time machine: Binance public market data.

## Security
Keys live only in `.env` and host environment variables, never in git. Everything runs on testnet. Guest keys are server-held and testnet only; do not reuse this pattern for real funds.

## License
MIT, see [`LICENSE`](LICENSE).
