# S1 evidence: contract-initiated Chain Signatures (NEAR testnet)

Date: 2026-11-09. Network: NEAR testnet. Throwaway spike account (not a project account): `floor-spike-60701.testnet`.

| Item | Value |
|---|---|
| Account creation tx | `FgBMrnHmhVUKgcoVuXpqP4a2qFD7xu8D9ejXb1CnXerN` |
| Contract deploy + init tx | `6iMtyWiqneAWJ78fCyRn9rbTFpdk4BpadGbzeGGtdYXi` |
| `sign_transfer` tx | `67sWDyjcmUUxQZ9riEJ56AQ68FgP46wRei11PizQqZB6` |
| Explorer | https://explorer.testnet.near.org/transactions/67sWDyjcmUUxQZ9riEJ56AQ68FgP46wRei11PizQqZB6 |
| Signer contract / version | `v1.signer-prod.testnet` / `3.18.0` |
| Wasm size | 136,318 bytes, sha256 `a4971357ca45b3c63363c80163f939327c912dc3a2158728ac0df5b00bf312d2` |
| Fee for `sign_transfer` | about 0.00116 NEAR (200 Tgas attached) |

## What was signed
EIP-1559 transaction on Sepolia (chain id 11155111): nonce 7, maxPriorityFee 1.5 gwei, maxFee 30 gwei, gas 100000, `to` = configured token address, value 0, data = ERC-20 `transfer(0x525521d79134822a342d330bd91da67976569af1, 5000000)`. (Placeholder recipient and amount; nothing was broadcast.)

- Signing hash computed **inside the contract** (RLP + `env::keccak256`): `ceee0c58ebce8ab6cba8a4f507e0429956c0296b6ad8e5eaad094141c244ca2e`.
- Same hash from viem 2.57.17 `serializeTransaction` + `keccak256`: identical. Pinned as a unit test in `contracts/spike-signer/src/evm.rs`.
- The MPC signer's log shows `predecessor = floor-spike-60701.testnet` and the same 32 payload bytes.

## Signature check
- Signer response: `big_r.affine_point = 02cc430c324bce76fa53a8b92d43dcb222f7147c49234164b48f53184956262252`, `s.scalar = 4f3942d07897cb4d5c21524dd9338ce7b4d8b04c8ca95cc078a3cd98a5891bd7`, `recovery_id = 0`.
- Derived address from `derived_public_key(path="floor-pool-1", predecessor=<contract>, domain_id=0)`: `0x758e534311B99055A08aC5658B03f5b27b84c638`.
- Address recovered from the signature with viem `recoverAddress`: `0x758e534311B99055A08aC5658B03f5b27b84c638`. **Match: true.**

## Not proven yet
The signed transaction was not broadcast. That needs Sepolia gas ETH and test USDC at `0x758e534311B99055A08aC5658B03f5b27b84c638` (or the address derived for the final contract) from public faucets, and the real USDC token address from Circle's docs. The token address used in the spike was only a placeholder for hashing.
