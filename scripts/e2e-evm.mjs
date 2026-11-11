// Cross-chain payout check: buy cover, name an Ethereum Sepolia address, break the peg, and wait for USDC to
// arrive on Ethereum via NEAR Chain Signatures. Needs the worker running and the contract-controlled sender funded.
//   node scripts/e2e-evm.mjs [http://localhost:8787] [0xRecipient]
const API = process.argv[2] ?? "http://localhost:8787";
const TO = process.argv[3] ?? "0x525521d79134822a342d330bd91da67976569af1";
const T0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - T0) / 1000)).padStart(3)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, d = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? "  (" + d + ")" : ""}`); };

async function api(method, path, body, token) {
  const res = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { "x-guest-token": token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
async function until(label, fn, ms, every = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${label}`); await sleep(every); }
}

try {
  await until("gate open", async () => (await api("GET", "/api/state")).gate?.open, 300_000, 5000);
  const evm = await api("GET", "/api/evm");
  check("cross-chain leg is configured and enabled", evm.enabled && evm.chain?.chain_id === 11155111);
  log(`sender ${evm.poolAddress}`);

  const g = await api("POST", "/api/guest");
  log(`guest ${g.accountId}`);
  const sa = await api("POST", "/api/payout-address", { address: TO }, g.token);
  check("holder registered an Ethereum address on NEAR", sa.ok, sa.tx_url);

  const rfq = await api("POST", "/api/rfq", { notional: 100, tenor_secs: 300 }, g.token);
  const buy = await api("POST", "/api/buy", { rfq_id: rfq.rfq_id, solver: rfq.best }, g.token);
  check("policy bought", buy.ok, `policy ${buy.policy_id}`);
  const pid = buy.policy_id;
  await until("Active", async () => (await api("GET", `/api/policies/${pid}`)).status === "Active", 150_000);

  log("breaking the peg");
  for (let i = 0; i < 3; i++) { const d = await api("POST", "/api/dump", { amount: 25000 }, g.token); log(`  dump ${i + 1}: ${(d.price_e8 / 1e8).toFixed(4)}`); await sleep(1700); }

  const paid = await until("PaidOut", async () => { const p = await api("GET", `/api/policies/${pid}`); return p.status === "PaidOut" ? p : null; }, 240_000);
  check("NEAR payout landed", paid.payout_amount === "15000000", `${Number(paid.payout_amount) / 1e6} fUSDC`);

  const po = await until("EVM payout reserved", async () => (await api("GET", "/api/evm", null, g.token)).payouts.find((x) => x.policy_id === pid), 60_000);
  check("cross-chain payout reserved, capped at 5 USDC", po.amount === "5000000" && po.to.toLowerCase() === TO.toLowerCase(), `${Number(po.amount) / 1e6} USDC -> ${po.to}`);

  const done = await until("EVM payout confirmed", async () => { const x = (await api("GET", "/api/evm")).payouts.find((y) => y.id === po.id); if (x) log(`  evm payout status: ${x.status}`); return x?.status === "Confirmed" ? x : null; }, 300_000, 8000);
  check("contract built the transaction and the MPC signed it", !!done.sighash && !!done.signature);
  check("transaction was broadcast on Ethereum Sepolia", /^0x[0-9a-f]{64}$/i.test(done.evm_tx ?? ""), done.evm_tx);
  console.log(`\nEtherscan: https://sepolia.etherscan.io/tx/${done.evm_tx}`);
} catch (e) { failures++; console.log("FAIL  aborted:", e.message); }
console.log(failures === 0 ? "\nEVM E2E ALL PASS" : `\nEVM E2E FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
