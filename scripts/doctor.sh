#!/usr/bin/env bash
# Checks that the local toolchain is ready. Run: make doctor  (or bash scripts/doctor.sh)
set -u
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

fail=0
check() { # name, command, [version command]
  if command -v "$2" >/dev/null 2>&1; then
    v=$("${@:3}" 2>&1 | head -1)
    printf 'PASS  %-14s %s\n' "$1" "$v"
  else
    printf 'FAIL  %-14s missing\n' "$1"; fail=1
  fi
}

check rustc     rustc rustc --version
check cargo     cargo cargo --version
check cargo-near cargo-near cargo near --version
check near-cli  near near --version
check node      node node --version
check pnpm      pnpm pnpm --version
check git       git git --version
check make      make make --version

if rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
  echo "PASS  wasm32 target  wasm32-unknown-unknown"
else
  echo "FAIL  wasm32 target  run: rustup target add wasm32-unknown-unknown"; fail=1
fi

exit $fail
