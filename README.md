# Floor

Floor is a NEAR-native stablecoin depeg cover market, built for NEAR HACKATHON 2026. Competing solver bots quote a price and back each policy with their own locked margin; NEAR contracts enforce a state gate and a sustained-breach trigger and pay the holder automatically, with no claim step. You can break the peg yourself in a live demo.

**Problem:** when a stablecoin loses its peg (for example USDC fell to about $0.87 in March 2023), holders have no cover they can buy in time, and pooled crypto cover has stayed small because capital is scarce and risk is hard to price.

> **Status: under construction.** The three contracts and the worker's quote and solver logic are built and tested locally (unit tests and a local-sandbox lifecycle test). Not yet built: testnet deployment, the keeper and bots running against a chain, the web app, and the optional EVM payout. Sections marked `NOT BUILT YET` do not work today. The authoritative list of what is verified is [`docs/CLAIMS.md`](docs/CLAIMS.md).

## What is real, testnet, simulated

| Piece | Status |
|---|---|
| NEAR contracts (`fusdc`, `peg-pool`, `floor`) | testnet: `floorxa-fusdc.testnet`, `floorxa-pool.testnet`, `floorxa-floor.testnet` (deployed 2026-11-11); also tested in a local sandbox |
| Demo money (NEP-141 `fusdc`) | demo credits, not real USDC; built |
| Stablecoin under test (`dUSD` on `peg-pool`) | simulated demo stable; built |
| Solvers (3 bots) | simulated, scripted and deterministic; strategy and signing logic built, bots running on-chain NOT BUILT YET |
| Payout on NEAR (NEP-141 transfer) | built; verified in the local sandbox, testnet NOT DONE YET |
| Payout on an EVM chain via NEAR Chain Signatures | testnet, optional, NOT BUILT YET (depends on a go/no-go spike) |
| NEAR Intents | no testnet exists; at most a `dry:true` quote display, NOT BUILT YET |
| Guest accounts | custodial and testnet only, NOT BUILT YET |

## How it works (design)
1. **Break the Peg:** a `peg-pool` contract on NEAR holds a demo stable pair. Anyone can dump or buy; each action is a real NEAR transaction that moves the on-chain price.
2. **Cover market:** a holder requests cover; three solver bots read the live pool price and return ed25519-signed quotes. The `floor` contract verifies the signature, locks that solver's margin for this policy only, and applies a state gate (price in band at purchase and activation, a lookback with no breach, a wait before activation). A late buyer is rejected on-chain.
3. **Trigger and payout:** if the price stays below a tier line for the sustain window, anyone can call `trigger` and the contract pays the holder in `fusdc` from the solver's margin.
4. **Cross-chain payout (optional):** the contract asks the NEAR MPC signer (Chain Signatures) to sign a USDC transfer on one EVM testnet, checked by the contract so the executor cannot redirect funds.

## Prerequisites
Linux, macOS or WSL (Windows users: run everything inside WSL). You need:
- Rust stable with the `wasm32-unknown-unknown` target
- `cargo-near` and `near-cli-rs`
- Node 24 and pnpm 10
- `make`, `git`, `curl`

## Run it: do X, see Y
1. Run `make doctor`.
   **See:** every line starts with `PASS` (rustc, cargo, cargo-near, near-cli, node, pnpm, git, make, wasm32 target).
2. `make setup` installs JavaScript dependencies. *(Works once packages exist.)*
3. `make verify` runs the offline checks (contract unit tests, a local-sandbox lifecycle test, worker tests). No secrets or testnet needed; the first run downloads the NEAR sandbox binary and compiles the contracts, so allow several minutes. **See:** seven `PASS` lines and a final `ALL PASS`.
4. `make dry` runs the whole app against a local NEAR sandbox with a stub signer and no secrets or network. **NOT BUILT YET.** Expected: open `http://localhost:3000/play`, press **Buy cover**, press **Dump**, see the late buyer blocked with `GATE_CLOSED`, then see the policy pay out.
5. `make demo` runs against NEAR testnet using `.env` (copy `.env.example`; see [`docs/SETUP.md`](docs/SETUP.md)). **NOT BUILT YET.**

## NEAR features used and where
| Feature | Where | Status |
|---|---|---|
| Own contracts in Rust (near-sdk 5.x) | `contracts/` | NOT BUILT YET |
| NEP-141 fungible token, `ft_transfer_call` / `ft_on_transfer` | `contracts/fusdc`, `contracts/floor` | NOT BUILT YET |
| `env::ed25519_verify` for solver-signed quotes | `contracts/floor` | NOT BUILT YET |
| Cross-contract calls and callbacks (price reads, payouts) | `contracts/floor` | NOT BUILT YET |
| Chain Signatures (MPC) for an EVM payout | `contracts/floor`, `apps/worker` | NOT BUILT YET, spike pending |
| Intents 1Click `dry:true` quote | `apps/web` | NOT BUILT YET, optional |

## Known limitations
- The peg under test is a demo stable on a demo pool, not USDC. The March 2023 USDC depeg is used only as a labelled historical reference.
- Solvers are scripted. NEAR's shared quote bus is documented for swaps; Floor runs its own risk-quote bus and does not claim NEAR's existing solvers underwrite cover.
- Per-policy margin is fully collateralised (capital-heavy for solvers); fixed partial payouts do not cover a total collapse.
- The trigger relies on pokes landing inside the sustain window; a TWAP is the next hardening step.
- The EVM payout (if shipped) is outbound-only; broadcast and confirmation come from a trusted executor, and the MPC committee is a trust assumption.
- Testnet only, demo credits, custodial guest accounts. Not regulated insurance. Crypto cover has failed before; this prototype does not prove demand.
- Items in [`docs/spikes.md`](docs/spikes.md) are unverified until marked done.

## Hackathon disclosures
- **Event:** NEAR HACKATHON 2026 (build window 2026-11-01 to 2026-11-14; code since the 2026-10-19 announcement counts).
- **Baseline vs hackathon work:** this repository was started for the hackathon; there is no pre-existing baseline code.
- **AI assistance:** Claude Code was used to help research, plan and write code and documentation. All claims are checked against `docs/CLAIMS.md`.
- **Third-party libraries:** see `package.json`, `pnpm-lock.yaml` and each `Cargo.toml` / `Cargo.lock` (near-sdk, near-contract-standards, near-api-js, chainsig.js, viem, Next.js, and others as added).
- **Other projects by the team:** none disclosed here yet.

## Repository layout
```
contracts/   Rust NEAR contracts (fusdc, peg-pool, floor)
apps/web     Next.js app (/play, landing, about)
apps/worker  keeper, solver bots, arbitrage bot, payout executor
docs/        SETUP, CLAIMS, spikes, threat model, evidence/
scripts/     helper scripts
```

## Security
Keys live only in `.env` (never committed; see `.gitignore`). Everything runs on NEAR testnet. Guest keys are server-held and testnet-only. Full threat model: `docs/threat-model.md` *(NOT BUILT YET)*.

## License
MIT, see [`LICENSE`](LICENSE).
