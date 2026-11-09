# Setup checklist (human steps)

Agents must not invent account names or create the payout account. You create these.

## 1. Toolchain (done for WSL Ubuntu)
Rust stable plus `wasm32-unknown-unknown`, `cargo-near`, `near-cli-rs`, Node 24, pnpm 10. Verify with `make doctor` inside WSL.

## 2. Testnet accounts
Pick a short unique prefix `<you>` (lowercase letters and digits). Create each account with the faucet:

```bash
near create-account <you>-floor.testnet --useFaucet
near create-account <you>-fusdc.testnet --useFaucet
near create-account <you>-pool.testnet --useFaucet
near create-account <you>-keeper.testnet --useFaucet
near create-account <you>-arb.testnet --useFaucet
near create-account <you>-solver-a.testnet --useFaucet
near create-account <you>-solver-b.testnet --useFaucet
near create-account <you>-solver-c.testnet --useFaucet
near create-account <you>-guests.testnet --useFaucet
```

The CLI is interactive; follow its prompts to save the key locally. Never paste private keys into chat or commit them. Put the keys you need into `.env` (copy from `.env.example`).

## 3. Mainnet payout account
Needed only at submission (named like `team.near` or a 64-character implicit account). It is yours; create it in any NEAR wallet. Do not reuse a testnet key.

## 4. Later (F3 only)
Test gas ETH and test USDC on the chosen EVM testnet, from public faucets and Circle's faucet. Look up the token address in Circle's docs.
