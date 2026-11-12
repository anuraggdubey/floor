// Three deterministic solver strategies. They read the live pool price (and recent history) and either
// quote a premium or decline. No randomness: the same inputs always give the same quote, so demos and
// tests are reproducible. These are scripted solvers and are labelled as such everywhere in the product.

export const PRICE_ONE = 100_000_000;

export interface Market {
  /** Latest pool price, 8-decimal fixed point. */
  price_e8: number;
  /** Recent prices, oldest first (at least the latest one). */
  history_e8: number[];
  /** Gate band: no cover is sold below this price. */
  band_e8: number;
}

export interface Request {
  notional: bigint;
  tenor_secs: number;
}

export interface Offer {
  premium: bigint;
  /** Largest notional this solver will back right now. */
  capacity: bigint;
}

export interface Strategy {
  name: string;
  /** Returns an offer, or null when the solver declines or pulls out. */
  quote(m: Market, r: Request): Offer | null;
}

const USDC = 1_000_000n;

/** Deviation of a price from the peg, in basis points (0 when at or above the peg). */
export function deviationBps(price_e8: number): number {
  return Math.max(0, Math.round(((PRICE_ONE - price_e8) * 10_000) / PRICE_ONE));
}

/** Realised volatility proxy: the largest peg deviation seen in the history window, in basis points. */
export function worstDeviationBps(history_e8: number[]): number {
  return history_e8.reduce((w, p) => Math.max(w, deviationBps(p)), 0);
}

export function premiumFromBps(notional: bigint, bps: number, tenor_secs: number): bigint {
  // bps is the premium per 5 minutes of tenor; scale linearly, minimum 1 base unit.
  const scaled = (notional * BigInt(Math.round(bps * 100)) * BigInt(tenor_secs)) / (10_000n * 100n * 300n);
  return scaled > 0n ? scaled : 1n;
}

/** A: prices off realised volatility. Premium = base + k * worst recent deviation. Declines if the price is out of band. */
export const volatilitySolver: Strategy = {
  name: "Volatility",
  quote(m, r) {
    if (m.price_e8 < m.band_e8) return null;
    const dev = worstDeviationBps(m.history_e8);
    const bps = 120 + 40 * dev;
    return { premium: premiumFromBps(r.notional, bps, r.tenor_secs), capacity: 5_000n * USDC };
  },
};

/** B: prices off a fixed historical event-rate prior. Steady premium, widens only after a visible drift, pulls out past 1.5% off the peg. */
export const historySolver: Strategy = {
  name: "History",
  quote(m, r) {
    if (m.price_e8 < m.band_e8) return null;
    const dev = deviationBps(m.price_e8);
    if (dev > 150) return null;
    const bps = 150 + (dev > 30 ? 200 : 0);
    return { premium: premiumFromBps(r.notional, bps, r.tenor_secs), capacity: 3_000n * USDC };
  },
};

/** C: aggressive and thin. Cheapest premium, small capacity, pulls out at the first sign of stress (0.3% off the peg). */
export const aggressiveSolver: Strategy = {
  name: "Aggressive",
  quote(m, r) {
    if (m.price_e8 < m.band_e8) return null;
    if (worstDeviationBps(m.history_e8) > 30) return null;
    if (r.notional > 200n * USDC) return null;
    return { premium: premiumFromBps(r.notional, 70, r.tenor_secs), capacity: 200n * USDC };
  },
};

export const STRATEGIES: Strategy[] = [volatilitySolver, historySolver, aggressiveSolver];

/** Picks the cheapest offer that can cover the request. */
export function bestOffer(offers: Array<{ solver: string; offer: Offer }>, r: Request) {
  return offers
    .filter((o) => o.offer.capacity >= r.notional)
    .sort((a, b) => (a.offer.premium < b.offer.premium ? -1 : a.offer.premium > b.offer.premium ? 1 : 0))[0];
}
