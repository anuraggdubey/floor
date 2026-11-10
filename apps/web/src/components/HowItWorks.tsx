"use client";

import { useMemo } from "react";
import { Diorama } from "./Diorama";
import { useScrollProgress } from "@/lib/useScrollProgress";
import type { SceneState } from "@/lib/diorama";

const STEPS: Array<{ title: string; body: string; tag: string }> = [
  {
    tag: "01 — The ground",
    title: "A peg you can actually see",
    body: "The reservoir is the stablecoin. Its water level is the live on-chain price, and the lines cut into the rock are the payout tiers. Nothing here is a mock: that level is read from a real pool contract on NEAR.",
  },
  {
    tag: "02 — The market",
    title: "Solvers bid to hold it up",
    body: "Three solver bots quote against your request, each with its own NEAR account and its own margin. The towers fill as capital is committed. The cheapest quote that can cover you wins.",
  },
  {
    tag: "03 — The cover",
    title: "You buy, and the margin locks",
    body: "Your premium and the winning solver's margin lock together in one contract call. A house lights up on the plaza: that is your policy, live, with a countdown before it activates.",
  },
  {
    tag: "04 — The break",
    title: "Someone dumps, and the water drops",
    body: "Anyone can sell into the pool. The level falls past the tier lines, the market stops quoting, and the gate slams: nobody can buy cover once the peg is already going. Latecomers are refused on-chain.",
  },
  {
    tag: "05 — The payout",
    title: "Held under too long. The floor cracks",
    body: "Stay below a line for the sustain window and the contract settles on its own, paying the deepest tier reached. No claim, no form, no committee. The money lands in the holder's account.",
  },
];

/** Build the scene for a given point in the story, interpolating between steps so it never jumps. */
function sceneFor(k: number): SceneState {
  const tiers = [0.97, 0.93, 0.9];
  const payouts = [0.03, 0.08, 0.15];

  // price arc: flat, flat, flat, dive, stay down
  const price = k < 3 ? 1 : k < 4 ? 1 - (k - 3) * 0.13 : 0.87;
  const committed = k < 1 ? 0.04 : k < 2 ? (k - 1) * 0.5 : k < 3 ? 0.5 + (k - 2) * 0.2 : 0.7;
  const sustained = k > 4.35;

  const houses: SceneState["houses"] =
    k < 2
      ? []
      : k < 3
        ? [{ id: 1, state: "pending" }]
        : k < 4.35
          ? [{ id: 1, state: "active" }, { id: 2, state: "active" }]
          : [{ id: 1, state: "paid" }, { id: 2, state: "paid" }];

  return {
    price,
    band: 0.995,
    gateOpen: price >= 0.995,
    tiers: tiers.map((p, i) => ({ price: p, payout: payouts[i]!, sustained: sustained && price < p })),
    houses,
    towers: [
      { id: "a", committed, out: k > 3.6 },
      { id: "b", committed: committed * 0.8, out: k > 3.9 },
      { id: "c", committed: committed * 0.55, out: k > 3.3 },
    ],
    paidAt: null,
    shockAt: null,
  };
}

export function HowItWorks() {
  const [ref, progress] = useScrollProgress<HTMLDivElement>();
  // map the usable middle of the scroll onto 0..5
  const k = Math.max(0, Math.min(STEPS.length, ((progress - 0.08) / 0.84) * STEPS.length));
  const active = Math.min(STEPS.length - 1, Math.floor(k));
  const scene = useMemo(() => sceneFor(k), [k]);

  return (
    <section ref={ref} id="how" className="relative">
      <div className="shell grid gap-10 lg:grid-cols-2 lg:gap-16">
        {/* the words scroll */}
        <div className="order-2 lg:order-1">
          <div className="pt-16 lg:pt-28">
            <p className="kicker" data-reveal>
              How it works
            </p>
            <h2 className="display-lg mt-5 max-w-[14ch] text-balance" data-reveal style={{ ["--reveal-delay" as string]: "80ms" }}>
              Watch it run, break and heal.
            </h2>
          </div>

          {STEPS.map((s, i) => (
            <div
              key={s.tag}
              className="flex min-h-[72svh] flex-col justify-center lg:min-h-[86svh]"
              aria-current={i === active ? "step" : undefined}
            >
              <div
                className="transition-all duration-700"
                style={{ opacity: i === active ? 1 : 0.28, transform: i === active ? "none" : "translateY(10px)" }}
              >
                <p className="kicker !text-blue-lit">{s.tag}</p>
                <h3 className="display-md mt-4 max-w-[16ch] text-balance">{s.title}</h3>
                <p className="text-mute mt-5 max-w-md text-pretty text-[1.0625rem] leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* the diorama sticks and reacts */}
        <div className="order-1 lg:order-2">
          <div className="sticky top-16 flex h-[52svh] items-center lg:h-[100svh]">
            <div className="border-line/70 bg-ink-2/40 relative h-[90%] w-full overflow-hidden rounded-xl border">
              <Diorama scene={scene} className="absolute inset-0 h-full w-full" scale={1} yOffset={0.02} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
                <div className="bg-ink/70 border-line/70 rounded-lg border px-3 py-2 backdrop-blur-md">
                  <p className="kicker !text-[0.5625rem]">Peg</p>
                  <p className="tnum text-[1.0625rem] leading-tight">${scene.price.toFixed(4)}</p>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 text-[0.8125rem] backdrop-blur-md ${
                    scene.gateOpen ? "border-mint/40 bg-mint/10 text-mint" : "border-blood/40 bg-blood/10 text-blood"
                  }`}
                >
                  {scene.gateOpen ? "Cover on sale" : "Gate closed"}
                </div>
              </div>
              <div className="border-line/70 pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between border-b px-4 py-2.5">
                <p className="kicker !text-[0.5625rem]">Floor · live diorama</p>
                <div className="flex gap-1.5">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 w-5 rounded-full transition-colors duration-500 ${i <= active ? "bg-blue" : "bg-line"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
