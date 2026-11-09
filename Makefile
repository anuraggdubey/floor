# Floor build entry points. Run inside Linux, macOS or WSL.
# Targets are added as the pieces are built; `make doctor` is the only one that exists on day one.

.PHONY: doctor setup

doctor:
	@bash scripts/doctor.sh

setup:
	pnpm install --frozen-lockfile=false
