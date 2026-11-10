"use client";

import { useLive } from "./LiveProvider";
import { usdc } from "@/lib/api";

const BLURB: Record<string, string> = {
  volatility: "Prices off how far the peg has wandered recently. Widens fast when the ground starts moving.",
  history: "Charges a steady rate from a fixed event-rate prior, then steps up once a real drift appears.",
  aggressive: "Cheapest quote in calm weather, thin capacity, and the first to walk away at any sign of stress.",
};

/** The live solver book: who is quoting, who has pulled out, and how much of their own money is at stake. */
export function MarketSection() {
  const live = useLive();
  const solvers = live.state?.solvers ?? [];

  return (
    <section id="market" className="border-line/70 border-t py-24 md:py-32">
      <div className="shell">
        <div className="max-w-2xl">
          <p className="kicker" data-reveal>
            The market
          </p>
          <h2 className="display-lg mt-5 text-balance" data-reveal style={{ ["--reveal-delay" as string]: "80ms" }}>
            Nobody sets the price. The book does.
          </h2>
          <p
            className="text-mute mt-6 text-pretty text-[1.0625rem] leading-relaxed"
            data-reveal
            style={{ ["--reveal-delay" as string]: "160ms" }}
          >
            Pooled cover has stayed small because the capital is scarce and the premium is a guess. Here each
            policy is backed by one solver&apos;s own locked margin, and the premium is whatever the cheapest
            solver will take. When risk rises, quotes widen and capacity leaves — which is exactly when cover{" "}
            <em className="text-bone not-italic">should</em> get expensive.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {(solvers.length ? solvers : [null, null, null]).map((s, i) => {
            const free = s ? Number(s.free) : 0;
            const locked = s ? Number(s.locked) : 0;
            const total = free + locked;
            const pct = total ? (locked / total) * 100 : 0;
            return (
              <div
                key={s?.id ?? i}
                className="border-line/80 bg-ink-2/60 hover:border-mute/40 group rounded-xl border p-6 transition-colors duration-500"
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[1.0625rem] font-medium">{s?.name ?? "—"}</p>
                    <p className="text-mute/70 mt-1 font-mono text-[0.6875rem]">{s?.id ?? "connecting…"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] ${
                      s?.active ? "border-mint/40 bg-mint/10 text-mint" : "border-line text-mute"
                    }`}
                  >
                    {s?.active ? "quoting" : "idle"}
                  </span>
                </div>

                <p className="text-mute mt-5 min-h-[4.5rem] text-[0.9375rem] leading-relaxed">
                  {s?.strategy ? BLURB[s.strategy] : "Reading the book…"}
                </p>

                <div className="mt-5">
                  <div className="text-mute flex items-baseline justify-between text-[0.8125rem]">
                    <span>Margin committed</span>
                    <span className="tnum text-bone">
                      {usdc(locked, 0)} / {usdc(total, 0)}
                    </span>
                  </div>
                  <div className="bg-ink-3 mt-2.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-blue h-full rounded-full transition-[width] duration-1000"
                      style={{ width: `${Math.max(1.5, pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-mute/70 mt-6 text-[0.8125rem]" data-reveal>
          These three are scripted bots, and we say so everywhere. A real book would need real underwriters; the
          point here is that the structure, the signing and the margin are real on-chain.
        </p>
      </div>
    </section>
  );
}
