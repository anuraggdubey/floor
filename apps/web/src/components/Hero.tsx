"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Diorama } from "./Diorama";
import { SplitText } from "./Reveal";
import { useLive } from "./LiveProvider";
import { useScene } from "@/lib/useFloor";
import { price as fmtPrice } from "@/lib/api";

/** Full-bleed hero: the live diorama behind, the promise in front. */
export function Hero() {
  const live = useLive();
  const scene = useScene(live);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const p = live.price ? live.price.price_e8 / 1e8 : 1;
  const open = live.gate?.open ?? true;
  const broken = p < (scene.band || 0.995);

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden pt-16">
      {/* the diorama lives behind everything, moving whether or not anyone is looking */}
      <Diorama
        scene={scene}
        className="absolute inset-0 -z-20 h-full w-full"
        scale={0.66}
        xOffset={0.2}
        yOffset={0.08}
        parallax
      />
      {/* just enough scrim to hold the type, not enough to hide the ground */}
      <div className="from-ink via-ink/60 pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r to-transparent" />
      <div className="from-ink pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t to-transparent" />
      <div className="from-ink/70 pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b to-transparent" />

      <div className="shell relative">
        {/* live status chip — the proof that this is a real chain, not a mock */}
        <div
          className="border-line/80 bg-ink-2/70 mb-7 inline-flex items-center gap-3 rounded-full border px-3.5 py-1.5 backdrop-blur-md"
          data-reveal
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live.connected ? (broken ? "bg-blood" : "bg-mint") : "bg-mute"
            }`}
            style={live.connected ? { animation: "blink 1.6s ease-in-out infinite" } : undefined}
          />
          <span className="kicker !text-mute !tracking-[0.16em]">NEAR testnet</span>
          <span className="bg-line h-3 w-px" />
          <span className="tnum text-[0.8125rem] text-bone">
            {mounted && live.price ? `$${fmtPrice(live.price.price_e8)}` : "$1.0000"}
          </span>
          <span className={`text-[0.8125rem] ${open ? "text-mint" : "text-blood"}`}>
            {mounted ? (open ? "cover open" : "cover closed") : "cover open"}
          </span>
        </div>

        <h1 className="display-xl max-w-[18ch] text-balance">
          <SplitText as="span" step={14}>
            The floor under
          </SplitText>
          <br />
          <SplitText as="span" delay={160} step={14}>
            your stablecoin.
          </SplitText>
        </h1>

        <p
          className="text-mute mt-7 max-w-xl text-pretty text-[1.0625rem] leading-relaxed md:text-[1.1875rem]"
          data-reveal
          style={{ ["--reveal-delay" as string]: "420ms" }}
        >
          Solvers compete to cover your depeg risk and back it with their own margin. Hold below the line long
          enough and the contract pays you — no claim, no committee, no waiting.
        </p>

        <div
          className="mt-9 flex flex-wrap items-center gap-3"
          data-reveal
          style={{ ["--reveal-delay" as string]: "520ms" }}
        >
          <Link
            href="/play"
            className="group bg-blue hover:bg-blue-lit inline-flex items-center gap-2 rounded-[4px] px-6 py-3.5 text-[1rem] font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(30,110,243,0.4)]"
          >
            Break the peg
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
          <a
            href="#how"
            className="border-line hover:border-mute/70 hover:bg-ink-2 inline-flex items-center rounded-[4px] border px-6 py-3.5 text-[1rem] font-medium transition-all duration-300"
          >
            How it works
          </a>
        </div>

        <p
          className="text-mute/70 mt-6 text-[0.8125rem]"
          data-reveal
          style={{ ["--reveal-delay" as string]: "600ms" }}
        >
          No wallet. No gas. Testnet demo credits.
        </p>
      </div>

      {/* scroll cue */}
      <div className="shell pointer-events-none absolute inset-x-0 bottom-8">
        <div className="text-mute/60 flex items-center gap-3">
          <span className="kicker !text-[0.625rem]">Scroll</span>
          <span className="via-line h-px w-16 bg-gradient-to-r from-transparent to-transparent" />
        </div>
      </div>
    </section>
  );
}
