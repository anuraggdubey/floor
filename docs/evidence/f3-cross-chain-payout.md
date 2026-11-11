# F3 evidence: a NEAR contract paid USDC on Ethereum Sepolia (Chain Signatures)

Date: 2026-11-11. Networks: NEAR testnet and Ethereum Sepolia.

| Item | Value |
|---|---|
| NEAR contract | `floorxa-floor.testnet` |
| MPC signer | `v1.signer-prod.testnet` (domain 0, ECDSA) |
| Contract-controlled EVM sender | `0xf41988ac6391F4657fB8B9d652bc4e130f994F24` (derived from the contract account + path `floor-pool-1`) |
| Policy | #5, holder `g003fae46e4.floorxa-guests.testnet` |
| Holder registered address (NEAR tx) | `8zvnG8uKqPjaDcAnojDemC8TqA2epDkdsmsEZ42oZJ5y` |
| MPC sign request (NEAR tx) | `32LSuy2Js4FWPXbCCfyReuAABL92kFdrVRom4Ctd7V4V` |
| Signing hash, built inside the contract | `d772d984d40e7ebd8fd1003c9526e0fb9178248ec834a03f5038962bae212790` |
| Ethereum transaction | `0x22fe00940d020c6b0f776445ed102c478e1a4b8bfcbc8425672306095c835b03` |
| Etherscan | https://sepolia.etherscan.io/tx/0x22fe00940d020c6b0f776445ed102c478e1a4b8bfcbc8425672306095c835b03 |
| Result | receipt status `0x1` (success), block `0xb8d597`, gas used `0xd263`; `from` = the contract-controlled sender, `to` = Circle's Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Amount | 5.00 USDC (the NEAR payout was 15 fUSDC; the cross-chain leg is capped at 5) |
| Sender balance after | 15.00 USDC (was 20.00 before), which matches the 5 USDC payout |

## What this proves
- The contract built the EIP-1559 transaction from its own state (token, recipient, amount, chain id) and hashed it; the caller supplied only gas parameters and a nonce.
- The NEAR MPC signed that hash for the address derived from the **contract** account, and the signature was accepted by Ethereum.
- No bridge and no wrapped token: native USDC moved on its own chain.

## What it does not prove
- The `Confirmed` status on NEAR is the worker reporting the hash it broadcast. The contract cannot read Ethereum, so this is a trusted step. The receipt above was checked separately, against Ethereum's RPC.
- The recipient address (`0x525521d7…9af1`) is a placeholder test address, not one of ours; its balance includes funds that did not come from this payout.
- One run on one chain (Ethereum Sepolia). Base Sepolia and Arbitrum Sepolia were not tried.
