import { describe, expect, it } from "vitest";
import { STRATEGIES, aggressiveSolver, bestOffer, deviationBps, historySolver, volatilitySolver, worstDeviationBps, type Market } from "../src/solvers.js";

const USDC = 1_000_000n;
const req = { notional: 100n * USDC, tenor_secs: 300 };
const calm: Market = { price_e8: 100_000_000, history_e8: [100_000_000, 100_000_000], band_e8: 99_500_000 };

describe("deviation helpers", () => {
  it("measures distance from the peg in basis points", () => {
    expect(deviationBps(100_000_000)).toBe(0);
    expect(deviationBps(101_000_000)).toBe(0);
    expect(deviationBps(99_000_000)).toBe(100);
    expect(deviationBps(90_000_000)).toBe(1000);
  });
  it("takes the worst point in the history window", () => {
    expect(worstDeviationBps([100_000_000, 99_800_000, 99_900_000])).toBe(20);
  });
});

describe("solver strategies are deterministic", () => {
  it("returns identical offers for identical inputs", () => {
    for (const s of STRATEGIES) expect(s.quote(calm, req)).toEqual(s.quote(calm, req));
  });
});

describe("calm market: every solver quotes and the aggressive one is cheapest", () => {
  const offers = STRATEGIES.map((s) => ({ solver: s.name, offer: s.quote(calm, req)! }));
  it("all three quote", () => expect(offers.every((o) => o.offer !== null)).toBe(true));
  it("aggressive undercuts the others", () => {
    const best = bestOffer(offers, req)!;
    expect(best.solver).toBe("Aggressive");
  });
  it("premiums scale with tenor", () => {
    const short = volatilitySolver.quote(calm, { ...req, tenor_secs: 150 })!;
    const long = volatilitySolver.quote(calm, { ...req, tenor_secs: 300 })!;
    expect(long.premium).toBeGreaterThan(short.premium);
  });
});

describe("stress: quotes widen then solvers pull out one by one", () => {
  it("aggressive pulls out first (more than 0.3% drift in the window)", () => {
    const drift: Market = { price_e8: 99_800_000, history_e8: [100_000_000, 99_600_000, 99_800_000], band_e8: 99_500_000 };
    expect(aggressiveSolver.quote(drift, req)).toBeNull();
    expect(historySolver.quote(drift, req)).not.toBeNull();
    expect(volatilitySolver.quote(drift, req)).not.toBeNull();
  });
  it("volatility solver widens as the worst deviation grows", () => {
    const calmQ = volatilitySolver.quote(calm, req)!;
    const driftQ = volatilitySolver.quote({ ...calm, price_e8: 99_800_000, history_e8: [99_700_000, 99_800_000] }, req)!;
    expect(driftQ.premium).toBeGreaterThan(calmQ.premium);
  });
  it("history solver widens after a 30bp drift", () => {
    const calmQ = historySolver.quote(calm, req)!;
    const driftQ = historySolver.quote({ ...calm, price_e8: 99_600_000, history_e8: [99_600_000] }, req)!;
    expect(driftQ.premium).toBeGreaterThan(calmQ.premium);
  });
  it("everyone declines once the price is out of the gate band", () => {
    const broken: Market = { price_e8: 93_000_000, history_e8: [100_000_000, 93_000_000], band_e8: 99_500_000 };
    for (const s of STRATEGIES) expect(s.quote(broken, req)).toBeNull();
  });
});

describe("capacity", () => {
  it("aggressive declines requests above its small capacity", () => {
    expect(aggressiveSolver.quote(calm, { notional: 500n * USDC, tenor_secs: 300 })).toBeNull();
  });
  it("bestOffer skips solvers that cannot cover the notional", () => {
    const big = { notional: 1_000n * USDC, tenor_secs: 300 };
    const offers = STRATEGIES.flatMap((s) => {
      const o = s.quote(calm, big);
      return o ? [{ solver: s.name, offer: o }] : [];
    });
    expect(bestOffer(offers, big)!.solver).not.toBe("Aggressive");
  });
});
