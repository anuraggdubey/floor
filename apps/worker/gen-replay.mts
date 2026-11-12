// Builds apps/web/public/replay.json: the real March 2023 USDC depeg (Binance USDC/USDT 15-minute candles) with
// the three underwriters' quotes and reasoning at ~14 moments of the crash, plus a backtest of one 100 fUSDC cover.
//
//   pnpm --filter @floor/worker exec tsx gen-replay.mts           # uses GROQ_API_KEY from .env; falls back to scripted solvers, labelled
//
// The AI answers are generated once, here, and committed, so the page is instant and needs no key or worker.
// It is a simulation on real price data. No transaction is made.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { askUnderwriter, agentCfgFromEnv, PERSONAS } from "./src/agent.js";
import { STRATEGIES, premiumFromBps, type Market } from "./src/solvers.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const START = Date.UTC(2023, 2, 11, 14, 0, 0); // first USDC/USDT candle on Binance during the depeg
const END = Date.UTC(2023, 2, 14, 0, 0, 0);
const BAND = 99_500_000;
const TIERS = [
  { below: 97_000_000, bps: 300 },
  { below: 93_000_000, bps: 800 },
  { below: 90_000_000, bps: 1500 },
];
const NOTIONAL = 100_000_000n; // 100 fUSDC
const TENOR = 900;
const SOLVERS = [
  { id: "A", key: "volatility", strat: STRATEGIES[0]! },
  { id: "B", key: "history", strat: STRATEGIES[1]! },
  { id: "C", key: "aggressive", strat: STRATEGIES[2]! },
];

const url = `https://data-api.binance.vision/api/v3/klines?symbol=USDCUSDT&interval=15m&startTime=${START}&endTime=${END}&limit=1000`;
const raw: any[] = await (await fetch(url)).json();
if (!Array.isArray(raw) || raw.length < 50) throw new Error("could not fetch klines");
const candles = raw.map((k) => ({ t: k[0] as number, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
const e8 = (x: number) => Math.round(x * 1e8);

// Backtest: a holder buys at the first candle's open price level (1.00) and holds for TENOR; tier = deepest line
// the CLOSE stayed under for at least one 15-minute candle (far longer than the 30 s sustain window).
function deepestTier(closes: number[]): number | null {
  let best: number | null = null;
  closes.forEach((c) => TIERS.forEach((t, i) => c * 1e8 < t.below && (best === null || i > best) && (best = i)));
  return best;
}
const windowCandles = candles.filter((c) => c.t < START + TENOR * 1000);
const tier = deepestTier(windowCandles.map((c) => c.c));
const lowest = candles.reduce((m, c) => (c.l < m.l ? c : m), candles[0]!);
const lowestClose = candles.reduce((m, c) => (c.c < m.c ? c : m), candles[0]!);

const idxs = new Set<number>([0, 1, 2, 4, 8, 14, 22, 32, 46, 64, 90, 130, 180, candles.length - 1, candles.indexOf(lowestClose)]);
// -1 is the first candle's OPEN (1.0000): the last price before the crash prints. This pair began trading mid-crash, so there is no earlier real data.
const picks = [-1, ...[...idxs].filter((i) => i >= 0 && i < candles.length).sort((a, b) => a - b)];

const agent = agentCfgFromEnv();
console.log(agent ? `AI underwriters via ${agent.model}` : "No GROQ_API_KEY: scripted solvers (labelled)");

const waypoints: any[] = [];
for (const i of picks) {
  const c = i === -1 ? { t: START, c: candles[0]!.o } : candles[i]!;
  const hist = i === -1 ? [e8(c.c)] : candles.slice(Math.max(0, i - 20), i + 1).map((k) => e8(k.c));
  const m: Market = { price_e8: e8(c.c), history_e8: hist, band_e8: BAND };
  const solvers = await Promise.all(
    SOLVERS.map(async (s) => {
      const r = { notional: NOTIONAL, tenor_secs: TENOR };
      const gateClosed = m.price_e8 < BAND;
      let d = null;
      for (let a = 0; agent && !d && a < 4; a++) {
        if (a) await new Promise((res) => setTimeout(res, 2500 * a));
        d = await askUnderwriter(agent, s.key, m, r, 1_000_000_000n);
      }
      if (d) {
        const quote = d.quote && !gateClosed;
        return {
          id: s.id,
          name: PERSONAS[s.key]!.name,
          ai: true,
          decision: quote ? "quote" : "refuse",
          premium: quote ? Number(premiumFromBps(NOTIONAL, d.bps, TENOR)) / 1e6 : null,
          bps: quote ? d.bps : null,
          thought: d.thought,
        };
      }
      const o = gateClosed ? null : s.strat.quote(m, r);
      return {
        id: s.id,
        name: s.strat.name,
        ai: false,
        decision: o ? "quote" : "refuse",
        premium: o ? Number(o.premium) / 1e6 : null,
        bps: null,
        thought: o ? null : gateClosed ? "Gate closed: the peg is under stress." : "Pulled out: risk too high.",
      };
    }),
  );
  waypoints.push({ i, t: c.t, price: c.c, open: i === -1, solvers });
  console.log(new Date(c.t).toISOString().slice(5, 16), c.c.toFixed(4), solvers.map((s) => `${s.id}:${s.decision}${s.premium != null ? " " + s.premium.toFixed(2) : ""}`).join("  "));
}

const first = waypoints[0]!;
const best = first.solvers.filter((s: any) => s.premium != null).sort((a: any, b: any) => a.premium - b.premium)[0];
const out = {
  generated: new Date().toISOString(),
  source: "Binance USDC/USDT 15-minute candles (data-api.binance.vision), 2023-03-11 14:00 UTC to 2023-03-14 00:00 UTC",
  ai: !!agent,
  model: agent?.model ?? null,
  band: BAND / 1e8,
  tiers: TIERS.map((t) => ({ below: t.below / 1e8, payout_pct: t.bps / 100 })),
  notional: Number(NOTIONAL) / 1e6,
  tenor_secs: TENOR,
  candles,
  waypoints,
  backtest: {
    lowest_print: { t: lowest.t, price: lowest.l },
    lowest_close: { t: lowestClose.t, price: lowestClose.c },
    tier,
    payout: tier === null ? 0 : (Number(NOTIONAL) / 1e6) * (TIERS[tier]!.bps / 10_000),
    best_premium: best?.premium ?? null,
    best_solver: best?.id ?? null,
  },
};
fs.writeFileSync(path.join(ROOT, "apps/web/public/replay.json"), JSON.stringify(out));
console.log("wrote apps/web/public/replay.json", (JSON.stringify(out).length / 1024).toFixed(0) + " KB", "backtest:", JSON.stringify(out.backtest));
