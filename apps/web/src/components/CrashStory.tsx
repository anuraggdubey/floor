"use client";

import { useScrollProgress } from "@/lib/useScrollProgress";

/**
 * The reason the thing exists, told once, in type. A stylised reconstruction of the March 2023 USDC
 * weekend draws itself as you scroll — clearly labelled as historical reference, not our data.
 */

// Hour offset from Friday 10 Mar 2023, and the peg price. Stylised from the public record of that weekend;
// exact venue prices differed, so this is shape, not a feed.
const PATH: Array<[number, number]> = [
  [-36, 1.0], [-24, 1.0], [-12, 0.9995], [-4, 0.999], [0, 0.998],
  [3, 0.99], [5, 0.975], [7, 0.95], [9, 0.93], [11, 0.905],
  [13, 0.885], [15, 0.878], [17, 0.9], [20, 0.92], [24, 0.93],
  [30, 0.94], [36, 0.96], [42, 0.985], [48, 0.995], [56, 0.999], [64, 1.0],
];

const MARKS: Array<{ h: number; label: string; sub: string }> = [
  { h: 0, label: "Friday evening", sub: "The peg starts to slip" },
  { h: 15, label: "≈ $0.87", sub: "Nothing left to buy cover with" },
  { h: 48, label: "Monday", sub: "Back on peg — for those who held" },
];

const H0 = -36;
const H1 = 64;
const LO = 0.86;
const HI = 1.005;

const W = 1000;
const H = 420;
const x = (h: number) => ((h - H0) / (H1 - H0)) * W;
const y = (p: number) => H - ((p - LO) / (HI - LO)) * H;

export function CrashStory() {
  const [ref, progress] = useScrollProgress<HTMLDivElement>();
  // the drawing happens over the middle of the scroll, so the headline lands first
  const t = Math.max(0, Math.min(1, (progress - 0.18) / 0.5));

  const d = PATH.map(([h, p], i) => `${i === 0 ? "M" : "L"}${x(h).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const len = 2600; // generous upper bound for the stroke length

  return (
    <section ref={ref} id="why" className="relative h-[230vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        {/* the chart, behind the words */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[62%] w-full max-w-[80rem] px-6 opacity-90" aria-hidden="true">
            <defs>
              <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff4438" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#ff4438" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* the peg, and the line cover would have paid at */}
            <line x1="0" y1={y(1)} x2={W} y2={y(1)} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
            <text x="6" y={y(1) - 8} fill="rgba(255,255,255,0.32)" fontSize="13" fontFamily="ui-monospace,monospace">
              $1.00 peg
            </text>
            {[0.97, 0.93, 0.9].map((lvl) => (
              <g key={lvl} opacity={t > 0.25 ? 1 : 0} style={{ transition: "opacity .6s ease" }}>
                <line
                  x1="0"
                  y1={y(lvl)}
                  x2={W}
                  y2={y(lvl)}
                  stroke="rgba(255,180,84,0.3)"
                  strokeWidth="1"
                  strokeDasharray="5 6"
                />
                <text x={W - 6} y={y(lvl) - 7} textAnchor="end" fill="rgba(255,180,84,0.6)" fontSize="12" fontFamily="ui-monospace,monospace">
                  ${lvl.toFixed(2)} — Floor would pay here
                </text>
              </g>
            ))}

            {/* area under the break */}
            <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#crashFill)" style={{ opacity: t }} />
            {/* the line itself, drawing in */}
            <path
              d={d}
              fill="none"
              stroke="#ff4438"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: len, strokeDashoffset: len * (1 - t) }}
            />

            {MARKS.map((m) => {
              const seen = t > (x(m.h) / W) * 0.95 + 0.05;
              const px = x(m.h);
              const pp = PATH.reduce((best, cur) => (Math.abs(cur[0] - m.h) < Math.abs(best[0] - m.h) ? cur : best));
              const py = y(pp[1]);
              return (
                <g key={m.h} style={{ opacity: seen ? 1 : 0, transition: "opacity .5s ease" }}>
                  <circle cx={px} cy={py} r="5" fill="#ff4438" />
                  <circle cx={px} cy={py} r="11" fill="none" stroke="#ff4438" strokeOpacity="0.35" />
                  <text x={px + 16} y={py - 10} fill="#f3f2ee" fontSize="16" fontFamily="ui-monospace,monospace">
                    {m.label}
                  </text>
                  <text x={px + 16} y={py + 10} fill="rgba(255,255,255,0.5)" fontSize="13">
                    {m.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* the words, over the chart */}
        <div className="shell pointer-events-none relative text-center">
          <p className="kicker" data-reveal>
            March 2023 · stylised from the public record, not a price feed
          </p>
          <h2 className="editorial mx-auto mt-6 max-w-[14ch] text-balance" data-reveal style={{ ["--reveal-delay" as string]: "120ms" }}>
            When the floor
            <br />
            gives way
          </h2>
          <p
            className="text-mute mx-auto mt-8 max-w-lg text-pretty text-[1.0625rem] leading-relaxed"
            data-reveal
            style={{ ["--reveal-delay" as string]: "260ms" }}
          >
            A stablecoin slipped to about 87 cents over one weekend. There was no cover a holder could buy in
            time, and nothing that paid out on its own.
          </p>
        </div>
      </div>
    </section>
  );
}
