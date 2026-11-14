"use client";

import { useLive } from "./LiveProvider";
import { CountUp } from "./CountUp";
import { ago } from "@/lib/api";

/** Four live numbers straight off the chain, in DeepBook's flat stat-strip arrangement. */
export function StatsRow() {
  const live = useLive();
  const p = live.price ? live.price.price_e8 / 1e8 : null;
  const stats = live.state?.stats;
  const posted = stats ? (Number(stats.free_margin) + Number(stats.locked_margin)) / 1e6 : 0;
  const locked = stats ? Number(stats.locked_margin) / 1e6 : 0;
  // Never show a zero that is really "no data yet": a dash, with the reason underneath, reads as loading, not as a dead product.
  const dash = <span className="text-mute/60">—</span>;
  const fresh = live.status === "live";
  const waiting = live.status === "loading" ? "connecting…" : "waking the server…";
  const old = live.asOf ? `last seen ${ago(live.asOf)}` : waiting;

  const items = [
    {
      label: "Peg right now",
      node: p !== null ? <CountUp value={p} dp={4} prefix="$" /> : dash,
      note: !fresh ? old : live.gate?.open ? "cover on sale" : "cover closed",
    },
    {
      label: "Policies written",
      node: stats ? <CountUp value={Number(stats.policies ?? 0)} /> : dash,
      note: !stats ? waiting : fresh ? "on NEAR testnet" : old,
    },
    {
      label: "Solver margin posted",
      node: stats ? <CountUp value={posted} prefix="" suffix="" /> : dash,
      note: !stats ? waiting : fresh ? `${locked.toLocaleString("en-US")} committed` : old,
    },
    { label: "Claims to file", node: <span>0</span>, note: "the contract just pays" },
  ];

  return (
    <section className="border-line/70 border-y">
      <div className="shell grid grid-cols-2 divide-x divide-y divide-[color:var(--color-line)]/70 md:grid-cols-4 md:divide-y-0">
        {items.map((s, i) => (
          <div
            key={s.label}
            className="px-1 py-8 first:pl-0 md:px-7 md:py-10"
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 70}ms` }}
          >
            <p className="kicker">{s.label}</p>
            <p className="tnum mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] leading-none tracking-tight">{s.node}</p>
            <p className="text-mute/80 mt-2.5 text-[0.8125rem]">{s.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
