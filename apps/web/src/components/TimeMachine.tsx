"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./Logo";

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
interface Desk { id: string; name: string; ai: boolean; decision: "quote" | "refuse"; premium: number | null; bps: number | null; thought: string | null }
interface Waypoint { i: number; t: number; price: number; open: boolean; solvers: Desk[] }
interface Replay {
  source: string; ai: boolean; model: string | null; band: number; notional: number; tenor_secs: number;
  tiers: Array<{ below: number; payout_pct: number }>;
  candles: Candle[]; waypoints: Waypoint[];
  backtest: { lowest_print: { t: number; price: number }; lowest_close: { t: number; price: number }; tier: number | null; payout: number; best_premium: number | null; best_solver: string | null };
}

const W = 1000, H = 380, PAD = { l: 56, r: 16, t: 20, b: 28 };
const Y_MIN = 0.86, Y_MAX = 1.01;
const fmtT = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ") + " UTC";

/** Reveals text a few characters at a time so the desks look like they are thinking. */
function Typed({ text, speed = 22 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <>
      {text.slice(0, n)}
      <span className="animate-pulse text-blue-lit">{n < text.length ? "▍" : ""}</span>
    </>
  );
}

export function TimeMachine() {
  const [data, setData] = useState<Replay | null>(null);
  const [idx, setIdx] = useState(-1); // -1 = the open, before the first print
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const raf = useRef<number | null>(null);
  const acc = useRef(0);

  useEffect(() => {
    fetch("/replay.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  const n = data?.candles.length ?? 0;
  const x = useCallback((i: number) => PAD.l + ((i + 1) / Math.max(1, n)) * (W - PAD.l - PAD.r), [n]);
  const y = (p: number) => PAD.t + ((Y_MAX - Math.min(Y_MAX, Math.max(Y_MIN, p))) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b);

  // Playback: step one candle at a time, slower around the crash so the eye can follow it.
  useEffect(() => {
    if (!playing || !data) return;
    let last = performance.now();
    const tick = (now: number) => {
      acc.current += now - last;
      last = now;
      const wait = idx < 40 ? 150 : 55;
      if (acc.current >= wait) {
        acc.current = 0;
        setIdx((i) => {
          if (i + 1 >= n) {
            setPlaying(false);
            setDone(true);
            return n - 1;
          }
          return i + 1;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, data, idx, n]);

  const wp = useMemo(() => {
    if (!data) return null;
    let cur: Waypoint | null = data.waypoints[0] ?? null;
    for (const w of data.waypoints) if (w.i <= idx) cur = w;
    return cur;
  }, [data, idx]);

  if (!data) return <main className="bg-ink text-mute grid min-h-screen place-items-center">Loading the real March 2023 data…</main>;

  const price = idx < 0 ? data.candles[0]!.o : data.candles[idx]!.c;
  const crashed = price < data.band;
  const deep = price < 0.93;
  const path = data.candles.slice(0, idx + 1).map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
  const area = idx >= 0 ? `${path} L${x(idx).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : "";
  const bt = data.backtest;
  const bought = idx >= 0 || playing;
  const best = data.waypoints[0]?.solvers.find((s) => s.id === bt.best_solver);
  const paid = idx >= 3 && bt.tier !== null;
  const reset = () => {
    setIdx(-1);
    setDone(false);
    setPlaying(false);
    acc.current = 0;
  };

  return (
    <main className={`bg-ink text-bone min-h-screen transition-colors duration-700 ${deep ? "bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,68,56,0.14),transparent_60%)]" : ""}`}>
      <header className="shell flex h-16 items-center justify-between">
        <Link href="/" aria-label="Floor home">
          <Logo />
        </Link>
        <Link href="/play" className="bg-blue hover:bg-blue-lit rounded-[4px] px-4 py-2 text-[0.9375rem] font-medium text-white transition-all hover:-translate-y-px">
          Break the peg yourself
        </Link>
      </header>

      <section className="shell pb-16 pt-6">
        <p className="text-amber font-mono text-[0.75rem] tracking-[0.22em] uppercase">Time machine · simulation on real data</p>
        <h1 className="font-display mt-3 max-w-3xl text-4xl leading-[1.05] font-semibold md:text-6xl">
          March 2023. USDC falls to <span className={`transition-colors ${crashed ? "text-blood" : "text-mint"}`}>${price.toFixed(3)}</span>.
        </h1>
        <p className="text-mute mt-4 max-w-2xl text-[1.0625rem]">
          Press play. We replay the real crash, 15 minutes per tick. {data.ai ? "Three AI underwriters" : "Three underwriters"} decide, in writing, whether to back a {data.notional} fUSDC cover, and what happens to the person who bought it.
        </p>

        <div className={`border-line bg-ink-2 relative mt-8 overflow-hidden rounded-xl border ${deep && playing ? "tm-shake" : ""}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="USDC price during the March 2023 depeg">
            <defs>
              <linearGradient id="tmfill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#ff4438" stopOpacity="0.35" />
                <stop offset="1" stopColor="#ff4438" stopOpacity="0" />
              </linearGradient>
              <filter id="tmglow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {[0.88, 0.9, 0.93, 0.97, 1].map((g) => (
              <g key={g}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth="1" />
                <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" className="fill-mute font-mono" fontSize="11">
                  {g.toFixed(2)}
                </text>
              </g>
            ))}
            <rect x={PAD.l} y={y(data.band)} width={W - PAD.l - PAD.r} height={H - PAD.b - y(data.band)} fill="#ff4438" opacity="0.05" />
            <line x1={PAD.l} x2={W - PAD.r} y1={y(data.band)} y2={y(data.band)} stroke="#ffb454" strokeDasharray="5 5" />
            <text x={W - PAD.r} y={y(data.band) - 6} textAnchor="end" fontSize="11" className="fill-amber font-mono">
              gate closes below {data.band.toFixed(3)}
            </text>
            {data.tiers.map((t) => (
              <g key={t.below}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t.below)} y2={y(t.below)} stroke="#ff4438" strokeOpacity="0.45" strokeDasharray="2 6" />
                <text x={W - PAD.r} y={y(t.below) - 6} textAnchor="end" fontSize="11" className="fill-blood font-mono">
                  pays {t.payout_pct}% under {t.below.toFixed(2)}
                </text>
              </g>
            ))}
            {area && <path d={area} fill="url(#tmfill)" />}
            {path && <path d={path} fill="none" stroke={crashed ? "#ff4438" : "#46e39b"} strokeWidth="2.5" strokeLinejoin="round" filter="url(#tmglow)" />}
            {data.waypoints.filter((w) => w.i >= 0 && w.i <= idx).map((w) => (
              <circle key={w.i} cx={x(w.i)} cy={y(w.price)} r="3.5" fill="var(--color-bone)" opacity="0.8" />
            ))}
            {idx >= 0 && (
              <g>
                <line x1={x(idx)} x2={x(idx)} y1={PAD.t} y2={H - PAD.b} stroke="#4b8dff" strokeOpacity="0.5" />
                <circle cx={x(idx)} cy={y(price)} r="6" fill={crashed ? "#ff4438" : "#46e39b"}>
                  <animate attributeName="r" values="5;9;5" dur="1.2s" repeatCount="indefinite" />
                </circle>
              </g>
            )}
          </svg>
          {done && paid && (
            <div className="tm-pop pointer-events-none absolute inset-0 grid place-items-center">
              <div className="bg-ink/80 border-mint rounded-lg border px-8 py-5 text-center backdrop-blur">
                <div className="text-mint font-mono text-[0.75rem] tracking-[0.2em] uppercase">paid by the contract</div>
                <div className="font-display text-mint text-5xl font-semibold">+{bt.payout.toFixed(2)} fUSDC</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              if (done) reset();
              setPlaying((p) => !p);
            }}
            className="bg-blue hover:bg-blue-lit rounded-[4px] px-5 py-2.5 font-medium text-white transition-all hover:-translate-y-px"
          >
            {playing ? "Pause" : done ? "Replay" : idx < 0 ? "Play the crash" : "Resume"}
          </button>
          <input
            aria-label="scrub"
            type="range"
            min={-1}
            max={n - 1}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setDone(false);
              setIdx(Number(e.target.value));
            }}
            className="accent-blue min-w-[160px] flex-1"
          />
          <span className="text-mute font-mono text-[0.8125rem]">{idx < 0 ? fmtT(data.candles[0]!.t) : fmtT(data.candles[idx]!.t)}</span>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {(wp?.solvers ?? []).map((s) => (
            <article key={s.id} className={`bg-ink-2 rounded-xl border p-5 transition-all duration-500 ${s.decision === "refuse" ? "border-blood/40" : "border-mint/30"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{s.name}</h3>
                <span className={`font-mono text-[0.6875rem] tracking-[0.18em] uppercase ${s.ai ? "text-blue-lit" : "text-mute"}`}>{s.ai ? "AI agent" : "scripted"}</span>
              </div>
              <div key={`${wp?.i}-${s.id}-d`} className={`font-display mt-3 text-3xl font-semibold ${s.decision === "refuse" ? "text-blood tm-stamp" : "text-mint"}`}>
                {s.decision === "refuse" ? "REFUSES" : `${s.premium?.toFixed(2)} fUSDC`}
              </div>
              <p className="text-mute mt-3 min-h-[4.5rem] text-[0.9375rem] leading-relaxed">
                {s.thought ? <Typed key={`${wp?.i}-${s.id}`} text={s.thought} /> : s.decision === "quote" ? "Quote signed with its own key and margin." : ""}
              </p>
            </article>
          ))}
        </div>

        {bought && (
          <div className="border-line bg-ink-2 mt-4 grid gap-6 rounded-xl border p-6 md:grid-cols-3">
            <div>
              <div className="text-mute font-mono text-[0.75rem] tracking-[0.18em] uppercase">You buy at the open</div>
              <div className="font-display mt-1 text-2xl">{data.notional} fUSDC cover for {best?.premium?.toFixed(2) ?? "?"}</div>
              <div className="text-mute text-sm">cheapest of three, solver {bt.best_solver}</div>
            </div>
            <div>
              <div className="text-mute font-mono text-[0.75rem] tracking-[0.18em] uppercase">Meanwhile</div>
              <div className="font-display text-blood mt-1 text-2xl">{data.notional} USDC → {(data.notional * price).toFixed(2)}</div>
              <div className="text-mute text-sm">lowest print ${bt.lowest_print.price} on Binance</div>
            </div>
            <div>
              <div className="text-mute font-mono text-[0.75rem] tracking-[0.18em] uppercase">Contract result</div>
              <div className={`font-display mt-1 text-2xl ${paid ? "text-mint" : "text-mute"}`}>{paid ? `+${bt.payout.toFixed(2)} paid, no claim` : "waiting for a sustained breach"}</div>
              <div className="text-mute text-sm">{paid ? `${(bt.payout / (best?.premium ?? 1)).toFixed(1)}x the premium` : "price must stay under a tier line"}</div>
            </div>
          </div>
        )}

        <p className="text-mute mt-8 max-w-3xl text-[0.8125rem] leading-relaxed">
          Honest limits: this is a simulation, not a transaction. Prices are real: {data.source}.{" "}
          {data.ai
            ? `The underwriters' answers were generated once by ${data.model} (an LLM) from the market data shown to them, then saved.`
            : "No LLM key was available when this file was built, so these are the scripted strategies."}{" "}
          The pair only began trading during the crash, so the “open” is the first candle’s opening price. A tier counts as sustained if a full 15-minute candle closed under it; the live contract needs 30 seconds.
        </p>
      </section>
    </main>
  );
}
