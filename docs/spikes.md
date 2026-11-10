# Spikes (go / no-go log)

| Spike | Question | Result | Decision |
|---|---|---|---|
| S1 | Can the `floor` contract build an EVM USDC transfer itself and get a valid signature from the NEAR MPC signer? | **Signing half PASSED on testnet (2026-11-09).** In-contract RLP + keccak matches viem byte for byte; the contract called `v1.signer-prod.testnet`; the returned signature recovers to the contract-derived EVM address. **Not yet done:** broadcasting on an EVM testnet (needs gas ETH and test USDC in the derived address, which a human must fund from faucets). | **GO** for F3 (Design A works). Broadcast check still pending. |
| S2 | NEP-141 `ft_transfer_call` plus storage registration flow works as planned? | **PASSED in the local sandbox (2026-11-10).** `fusdc` (near-contract-standards 5.30.1) with `ft_transfer_call` into `floor.ft_on_transfer` works for margin deposits and for buying cover. Floor must be storage-registered with fUSDC; refunds on rejected purchases work by returning the full amount. Not yet run on testnet. | **GO** |
| S3 | Can a local sandbox run the full lifecycle offline for `make verify` / `make dry`? | **PASSED (2026-11-10).** `near-workspaces` 0.22 (feature `unstable` for `compile_project`) runs all three contracts: buy, replay refused, dump, gate closes, late buyer refused, sustained trigger, 15 fUSDC payout, solver margin accounting; plus a flash dump that recovers pays nothing. About 255 s for the two tests on the first run (includes wasm compiles). | **GO** for `make verify`; `make dry` (UI against sandbox) not built yet |
| S4 | (optional) 1Click `dry:true` quote works with an API key; note limits | pending | pending |

## Findings from the testnet end-to-end run (2026-11-11)
- `rpc.testnet.near.org` now answers HTTP 429 "deprecated, stop using it". Use `https://test.rpc.fastnear.com` (set as the default; `.env.example` updated).
- near-api-js 7.4 refuses to send a transaction unless the sender's balance covers prepaid gas at about 10x the real gas price (150 Tgas needed about 0.15 NEAR). Guest accounts therefore get 0.3 NEAR and calls ask for at most 100 Tgas.
- The NEAR faucet (`sponsor-by-faucet-service`) rate-limits after about 10 accounts (HTTP 429).
- Contract bug found by the test and fixed: the first sustained tier could be triggered immediately, locking the payout at 3%, and anyone (including the solver) could do it. Fixed with an on-chain settlement delay `settle_secs`; the testnet contract was upgraded in place with a `migrate` call that kept all solvers, margins and policies.

## Findings from building the web app (2026-11-11)
- Public NEAR RPC free tiers rate-limit hard. Polling the pool every 1s plus a 2.5s keeper tick was enough to get `-429 Rate limits exceeded` from FastNEAR. Now: price every 3s, gate every 6s, keeper every 5s, reads spread round-robin over two endpoints, and the keeper skips its expensive reads when no policy is in flight.
- Next dev must be told `allowedDevOrigins` when it is reached over a LAN/WSL address, or the HMR client reload-loops and the page never hydrates — with no error in the console.
- The repo lives on the Windows filesystem, so inotify never fires inside WSL. `watchOptions.pollIntervalMs` in next.config is required for edits to be picked up at all, and brand-new route files still need a dev-server restart.

## S1 details
Evidence and exact values: [`docs/evidence/s1-chain-signatures.md`](evidence/s1-chain-signatures.md). Code: `contracts/spike-signer/`.

Confirmed from the signer's own source and live state (not from memory):
- Testnet signer `v1.signer-prod.testnet` runs contract version `3.18.0`; its live state lists ECDSA (CaitSith, secp256k1) as `domain_id` 0 with reconstruction threshold 11. (An older note said 17 nodes; the live state, not the note, is the source of truth. Participant count was not tallied.)
- Request shape: `sign({"request":{"payload_v2":{"Ecdsa":"<32-byte hex>"},"path":"...","domain_id":0}})`, 1 yoctoNEAR deposit, at least 10 Tgas attached (docs say about 7 Tgas used; we attached 60 Tgas to the signer call and 200 Tgas to our call).
- Response shape (`SignatureResponse`): `{"scheme":"Secp256k1","big_r":{"affine_point":"<33-byte hex>"},"s":{"scalar":"<32-byte hex>"},"recovery_id":0|1}`. `r` is bytes 1..33 of `big_r`.
- The derived key depends on the **calling contract's account id** plus the path (`derived_public_key(path, predecessor, domain_id)`), so only contract logic can ask for that address to be signed.
- The old `payload`/`key_version` request format in `near-examples/chainsig-script` is legacy; do not use it.

Not measured: broadcast on Sepolia, Base Sepolia or Arbitrum Sepolia; MPC latency under load; behaviour when the callback fails or the yield times out.
