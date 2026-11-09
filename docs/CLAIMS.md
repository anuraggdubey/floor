# Claims

Every claim the README or the X post makes must have a row here: how to verify it, what you should see, and its status (`live`, `testnet`, `simulated`, `not built`). Empty until features exist.

| Claim | Command / steps | Expected result | Status |
|---|---|---|---|
| A NEAR contract can build an EVM ERC-20 transfer and its signing hash itself, matching viem | `cd contracts && cargo test -p spike-signer` | 4 tests pass, including `signing_hash_matches_viem` | testnet-independent, verified 2026-11-09 |
| A contract can get a valid MPC (Chain Signatures) signature on that hash | See `docs/evidence/s1-chain-signatures.md` (tx `67sWDyjcmUUxQZ9riEJ56AQ68FgP46wRei11PizQqZB6` on testnet) | Recovered address equals the contract-derived address | testnet, verified 2026-11-09; broadcast not done |
