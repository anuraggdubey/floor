# Floor build entry points. Run inside Linux, macOS or WSL.
# Targets are added as the pieces are built.

.PHONY: doctor setup verify build-contracts

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
