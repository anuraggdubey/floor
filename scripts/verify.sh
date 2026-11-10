#!/usr/bin/env bash
# Offline verification: no secrets, no testnet. Prints one PASS/FAIL line per check and a final verdict.
# Usage: make verify   (needs Linux, macOS or WSL; the first run downloads the NEAR sandbox binary)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/floor-target}"

fail=0
LOGDIR="$(mktemp -d)"

run() { # name, dir, command...
  local name="$1" dir="$2"; shift 2
  if (cd "$ROOT/$dir" && "$@" >"$LOGDIR/$name.log" 2>&1); then
    printf 'PASS  %s\n' "$name"
  else
    printf 'FAIL  %s   (log: %s)\n' "$name" "$LOGDIR/$name.log"; fail=1
  fi
}

run "contracts: fusdc unit tests"        contracts cargo test -p fusdc
run "contracts: peg-pool unit tests"     contracts cargo test -p peg-pool
run "contracts: floor unit tests"        contracts cargo test -p floor
run "contracts: EVM tx hash vs viem"     contracts cargo test -p spike-signer
run "sandbox: buy, dump, trigger, payout" contracts cargo test -p integration-tests -- --test-threads=1
run "worker: install dependencies"       .           env CI=true pnpm install --frozen-lockfile
run "worker: quote bytes + strategies"   apps/worker pnpm test

if [ "$fail" -eq 0 ]; then echo "ALL PASS"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
