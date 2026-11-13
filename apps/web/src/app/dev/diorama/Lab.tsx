"use client";

import { useState } from "react";
import { Diorama } from "@/components/Diorama";
import type { SceneState } from "@/lib/diorama";
import { DirectorOverlay } from "@/components/play/DirectorOverlay";
import type { DirectorView } from "@/lib/useDirector";

const mock: DirectorView = {
  running: true,
  done: false,
  error: null,
  chapter: { n: 6, title: "Too late", line: "A latecomer tries to buy cover.", sub: "The contract looks at the price, sees stress, and says no." },
  total: 9,
  quotes: null,
  refused: "GATE_CLOSED",
  countdown: { label: "contract settles", until: Date.now() + 45000, total: 70000, approx: true },
  dumps: 3,
  tx: [{ label: "Policy bought", url: "#" }],
  result: null,
  camera: { scale: 1, x: 0, y: 0 },
  focus: true,
  canAdvance: true,
  manual: false,
};

const base: SceneState = {
  price: 1,
  band: 0.995,
  gateOpen: true,
  tiers: [
    { price: 0.97, payout: 0.03, sustained: false },
    { price: 0.93, payout: 0.08, sustained: false },
    { price: 0.9, payout: 0.15, sustained: false },
  ],
  houses: [
    { id: 1, state: "active" },
    { id: 2, state: "paid" },
    { id: 3, state: "pending" },
  ],
  towers: [
    { id: "a", committed: 0.3, out: false },
    { id: "b", committed: 0.2, out: false },
    { id: "c", committed: 0.1, out: true },
  ],
  paidAt: null,
  shockAt: null,
  impacts: [],
};

export function Lab() {
  const [s, setS] = useState<SceneState>(base);
  const [view, setView] = useState<DirectorView | null>(null);
  const fire = () => {
    const t = Date.now();
    setS((x) => ({ ...x, shockAt: t, impacts: [...(x.impacts ?? []), t] }));
  };
  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="border-line/70 flex flex-wrap items-center gap-3 border-b p-3 text-[0.8125rem]">
        <button id="impact" onClick={fire} className="bg-blood/20 text-blood rounded px-3 py-1.5">
          Dump impact
        </button>
        <button id="pay" onClick={() => setS((x) => ({ ...x, paidAt: Date.now() }))} className="bg-amber/20 text-amber rounded px-3 py-1.5">
          Payout
        </button>
        <button id="stamp" onClick={() => setView({ ...mock, countdown: null })} className="bg-blue/20 text-blue-lit rounded px-3 py-1.5">
          Refusal stamp
        </button>
        <button id="count" onClick={() => setView({ ...mock, refused: null, chapter: { n: 7, title: "Hold the line", line: "Stay under a line long enough and it counts.", sub: "A flash that recovers pays nothing." } })} className="bg-blue/20 text-blue-lit rounded px-3 py-1.5">
          Countdown
        </button>
        <button id="finale" onClick={() => setView({ ...mock, running: false, done: true, refused: null, countdown: null, result: { premium: 0.7, payout: 15, seconds: 147, evmUrl: null, evmSkipped: null } })} className="bg-blue/20 text-blue-lit rounded px-3 py-1.5">
          Finale
        </button>
        <label className="text-mute flex items-center gap-2">
          peg
          <input
            id="price"
            type="range"
            min={0.82}
            max={1.02}
            step={0.005}
            value={s.price}
            onChange={(e) => setS((x) => ({ ...x, price: Number(e.target.value) }))}
          />
          <span className="tnum text-bone">{s.price.toFixed(3)}</span>
        </label>
      </div>
      <div className="relative flex-1">
        <Diorama scene={s} className="absolute inset-0 h-full w-full" scale={1} />
        {view && <DirectorOverlay view={view} onStop={() => setView(null)} onRestart={() => setView(null)} onClose={() => setView(null)} soundOn={false} onToggleSound={() => {}} onNext={() => {}} onToggleManual={() => {}} />}
      </div>
    </div>
  );
}
