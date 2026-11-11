// Arbitrage bot: after a breach has lasted long enough for the contract to see it sustained, buy dUSD back
// so the peg recovers and every demo run ends. Scripted and labelled as such.
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";
import type { Bus } from "./events.js";
import type { PriceFeed } from "./prices.js";

export const BAND_E8 = 99_500_000;
const PRICE_ONE = 100_000_000n;
/** The pool rejects a single swap above 20% of the input-side reserve. */
const MAX_SWAP_BPS = 2_000n;

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * USD units to spend so that a constant-product pool returns to `targetE8`.
 * With k = r_usd * r_dusd and price = r_usd / r_dusd, the target reserve is r_usd' = sqrt(k * price).
 */
export function usdNeededToRestore(reserveUsd: bigint, reserveDusd: bigint, targetE8 = PRICE_ONE): bigint {
  const k = reserveUsd * reserveDusd;
  const target = isqrt((k * targetE8) / PRICE_ONE);
  const need = target - reserveUsd;
  return need > 0n ? need : 0n;
}

/** Largest single swap the pool will accept given the USD-side reserve. */
export function maxSwap(reserveUsd: bigint): bigint {
  return (reserveUsd * MAX_SWAP_BPS) / 10_000n;
}

export function startArb(chain: Chain, cfg: Cfg, feed: PriceFeed, bus: Bus) {
  const acct = chain.account(cfg.arb.id, cfg.arb.key);
  let breachSince: number | null = null;
  let busy = false;
  let enabled = true;
  /** When our last buy went out. The price feed polls every few seconds, so acting again on a snapshot older
   *  than this would size the next buy from reserves we have already changed, and overshoot the peg. */
  let lastBuyAt = 0;

  async function tick() {
    if (busy || !enabled) return;
    const snap = feed.latest;
    if (!snap) return;
    const now = Date.now();
    if (snap.t <= lastBuyAt + 1500) return; // wait for a price that reflects our last buy
    if (snap.price_e8 >= BAND_E8) {
      breachSince = null;
      return;
    }
    breachSince ??= now;
    if ((now - breachSince) / 1000 < cfg.arbDelaySecs) return;
    busy = true;
    try {
      const need = usdNeededToRestore(BigInt(snap.reserve_usd), BigInt(snap.reserve_dusd));
      if (need === 0n) return;
      const step = need < maxSwap(BigInt(snap.reserve_usd)) ? need : maxSwap(BigInt(snap.reserve_usd));
      const r = await chain.send(acct, cfg.pool, "buy_dusd", { amount: step.toString() }, { tgas: 30 });
      lastBuyAt = Date.now();
      bus.emit("arb", { ok: r.ok, spent_usd: step.toString(), tx: r.hash, error: r.error });
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void tick(), 3000);
  return {
    stop: () => clearInterval(timer),
    setEnabled: (v: boolean) => {
      enabled = v;
      if (!v) breachSince = null;
    },
  };
}
