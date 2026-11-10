// End-to-end check against the running worker API and NEAR testnet.
//   1. start the worker:  cd apps/worker && pnpm start
//   2. run this:          node scripts/e2e.mjs [http://localhost:8787]
// Flow: guest accounts -> RFQ with three scripted solvers -> buy -> wait Active -> break the peg ->
// late buyer refused on-chain -> solvers withdraw -> sustained breach pays the holder -> arbitrage restores the peg.
const API = process.argv[2] ?? "http://localhost:8787";
const T0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - T0) / 1000)).padStart(3)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-guest-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function until(label, fn, timeoutMs, everyMs = 2000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(everyMs);
  }
}

const usdc = (base) => Number(base) / 1e6;

try {
  // 0. the gate must be open to start: wait out any lookback from a previous run
  let state = await api("GET", "/api/state");
  log(`price ${state.price?.price_e8 / 1e8}, gate open: ${state.gate?.open}, reason: ${state.gate?.reason}`);
  await until("gate open", async () => (await api("GET", "/api/state")).gate?.open, 240_000, 5000);

  // 1. guests (real NEAR testnet sub-accounts, no wallet)
  const a = await api("POST", "/api/guest");
  const b = await api("POST", "/api/guest");
  log(`guest A ${a.accountId}, guest B ${b.accountId}`);
  check("guest accounts are funded with fUSDC and pool credits", BigInt(a.balances.fusdc) >= 5_000_000_000n && BigInt(a.balances.dusd) > 0n);

  // 2. RFQ: three scripted solvers quote
  const rfq = await api("POST", "/api/rfq", { notional: 100, tenor_secs: 300 }, a.token);
  log("offers:", rfq.offers.map((o) => `${o.name} ${usdc(o.premium)} fUSDC`).join(", "));
  check("three solvers quote and the cheapest is flagged best", rfq.offers.length === 3 && rfq.best === rfq.offers[0].solver);

  // 3. buy the best quote
  const before = await api("GET", "/api/me", null, a.token);
  const buy = await api("POST", "/api/buy", { rfq_id: rfq.rfq_id, solver: rfq.best }, a.token);
  log(`buy -> policy ${buy.policy_id} ${buy.tx_url}`);
  check("policy created on NEAR with a transaction link", buy.ok && buy.policy_id > 0 && buy.tx_url.includes(buy.tx));
  const premium = BigInt(rfq.offers[0].premium);

  // 4. keeper activates it after the wait
  const pid = buy.policy_id;
  await until("policy Active", async () => (await api("GET", `/api/policies/${pid}`)).status === "Active", 120_000);
  check("keeper activated the policy after the wait", true);

  // 5. late buyer B gets a quote now, then A breaks the peg
  const lateRfq = await api("POST", "/api/rfq", { notional: 100, tenor_secs: 300 }, b.token);
  check("quotes still available while the peg holds", lateRfq.offers.length > 0);
  log("breaking the peg: three dumps of 25,000 dUSD");
  for (let i = 0; i < 3; i++) {
    const d = await api("POST", "/api/dump", { amount: 25000 }, a.token);
    log(`  dump ${i + 1}: price ${(d.price_e8 / 1e8).toFixed(4)} ${d.tx_url}`);
    await sleep(1700);
  }
  state = await api("GET", "/api/state");
  check("price fell below every tier line", state.price.price_e8 < 90_000_000, `price ${state.price.price_e8 / 1e8}`);

  // 6. the gate closes and the late buyer is refused on-chain
  await until("gate closed", async () => (await api("GET", "/api/state")).gate?.open === false, 60_000, 2000);
  const late = await api("POST", "/api/buy", { rfq_id: lateRfq.rfq_id, solver: lateRfq.best }, b.token);
  check("late buyer refused on-chain with GATE_CLOSED", !late.ok && late.rejected === "GATE_CLOSED", `rejected=${late.rejected}`);
  const lateAfter = await api("GET", "/api/me", null, b.token);
  check("late buyer's premium was refunded in full", lateAfter.balances.fusdc === b.balances.fusdc);
  const rfq2 = await api("POST", "/api/rfq", { notional: 100, tenor_secs: 300 }, b.token);
  check("every solver declines while the peg is broken", rfq2.offers.length === 0 && rfq2.declined.length === 3);

  // 7. sustained breach: keeper triggers and the contract pays the holder in fUSDC on NEAR
  const paid = await until("policy PaidOut", async () => {
    const p = await api("GET", `/api/policies/${pid}`);
    return p.status === "PaidOut" ? p : null;
  }, 180_000, 3000);
  log(`payout: ${usdc(paid.payout_amount)} fUSDC, tier ${paid.tier_idx}`);
  check("holder paid 15% of notional (deepest tier)", paid.payout_amount === "15000000" && paid.tier_idx === 2);
  const after = await api("GET", "/api/me", null, a.token);
  const net = BigInt(after.balances.fusdc) - BigInt(before.balances.fusdc);
  check("holder's fUSDC rose by payout minus premium", net === 15_000_000n - premium, `net ${usdc(net)} fUSDC`);
  const st2 = await api("GET", "/api/state");
  const solver = st2.solvers.find((s) => s.id === rfq.best);
  check("winning solver has nothing locked after the payout", solver.locked === "0");

  // 8. the arbitrage bot restores the peg so the demo can run again
  await until("peg restored", async () => (await api("GET", "/api/state")).price.price_e8 >= 99_500_000, 240_000, 5000);
  check("arbitrage bot restored the peg", true);
} catch (e) {
  failures++;
  console.log("FAIL  e2e aborted:", e.message);
}
console.log(failures === 0 ? "\nE2E ALL PASS" : `\nE2E FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
