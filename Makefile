# Floor build entry points. Run inside Linux, macOS or WSL.
# Targets are added as the pieces are built.

.PHONY: doctor setup verify build-contracts worker e2e

doctor:
	@bash scripts/doctor.sh

setup:
	pnpm install

# Offline checks: contract unit tests, sandbox lifecycle test, worker tests. No secrets needed.
verify:
	@bash scripts/verify.sh

build-contracts:
	cd contracts/fusdc && cargo near build non-reproducible-wasm --no-abi
	cd contracts/peg-pool && cargo near build non-reproducible-wasm --no-abi
	cd contracts/floor && cargo near build non-reproducible-wasm --no-abi

# Live testnet (needs .env; see docs/SETUP.md). Starts the price feed, keeper, solver bots, arbitrage bot and the HTTP API on :8787.
worker:
	cd apps/worker && pnpm start

# Full end-to-end check against the running worker and NEAR testnet (about 4 minutes; real time windows).
e2e:
	node scripts/e2e.mjs
