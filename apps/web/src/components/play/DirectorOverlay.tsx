"use client";

import { useEffect, useState } from "react";
import type { Countdown, DirectorView } from "@/lib/useDirector";

/** A ring that drains as a window runs out. Reads the clock itself so the parent never re-renders per tick. */
function Ring({ c }: { c: Countdown }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, c.until - now);
  const frac = Math.max(0, Math.min(1, left / Math.max(1, c.total)));
  const R = 21;
  const C = 2 * Math.PI * R;
  const secs = Math.ceil(left / 1000);

  return (
    <div className="flex items-center gap-3.5">
      <svg viewBox="0 0 52 52" className="h-[3.25rem] w-[3.25rem] -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke="#46e39b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.28s linear" }}
        />
      </svg>
      <div>
        <p className="tnum text-[1.5rem] leading-none">
          {c.approx && secs > 0 ? "≈ " : ""}
          {secs}
          <span className="text-mute ml-1 text-[0.8125rem]">s</span>
        </p>
        <p className="kicker mt-1.5 !text-[0.5625rem]">{c.label}</p>
      </div>
    </div>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function DirectorOverlay({
  view,
  onStop,
  onRestart,
  onClose,
  soundOn,
  onToggleSound,
  onNext,
  onToggleManual,
}: {
  view: DirectorView;
  onStop: () => void;
  onRestart: () => void;
  onClose: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onNext: () => void;
  onToggleManual: (on: boolean) => void;
}) {
  const active = view.running || view.done || !!view.error;

  // Esc stops the run, the way you would expect from anything that takes over the screen
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (view.running ? onStop : onClose)();
      // → / Space / Enter: next slide, but never steal Space or Enter from a focused button or field
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON" || el.isContentEditable);
      if (view.running && (e.key === "ArrowRight" || (!typing && (e.key === " " || e.key === "Enter")))) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, view.running, onStop, onClose, onNext]);

  const ch = view.chapter;
  const mult = view.result && view.result.premium > 0 ? view.result.payout / view.result.premium : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
      {/* cinematic bars: they slide in when the run starts and out when it ends */}
      <div
        className="absolute inset-x-0 top-0 bg-black transition-[height] duration-[900ms] ease-[var(--ease-smooth)]"
        style={{ height: active ? "4.5vh" : 0 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-black transition-[height] duration-[900ms] ease-[var(--ease-smooth)]"
        style={{ height: active ? "4.5vh" : 0 }}
      />

      {active && (
        <>
          {/* chapter rail */}
          <div className="absolute inset-x-0 top-[5.4vh] flex items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex flex-1 gap-1.5">
              {Array.from({ length: Math.max(view.total, 1) }).map((_, i) => {
                const n = i + 1;
                const state = view.done || (ch && n < ch.n) ? "done" : ch && n === ch.n ? "now" : "todo";
                return (
                  <span key={i} className="bg-white/12 relative h-[3px] flex-1 overflow-hidden rounded-full">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full bg-[color:var(--color-blue-lit)] ${
                        state === "now" ? "w-full animate-pulse" : state === "done" ? "w-full" : "w-0"
                      }`}
                    />
                  </span>
                );
              })}
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
              {view.running && (
                <>
                  <button
                    onClick={(e) => {
                      onToggleManual(!view.manual);
                      e.currentTarget.blur(); // keep Space and Enter free to move on
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[0.75rem] backdrop-blur-md transition-colors ${
                      view.manual ? "border-blue-lit/70 bg-blue/20 text-bone" : "border-line/80 bg-ink/70 text-mute hover:border-mute/60 hover:text-bone"
                    }`}
                    aria-pressed={view.manual}
                    title="Pause on every slide and move on with Next"
                  >
                    Step by step
                  </button>
                  <button
                    onClick={(e) => {
                      onNext();
                      e.currentTarget.blur();
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-[0.75rem] font-medium text-white backdrop-blur-md transition-colors ${
                      view.canAdvance ? "bg-blue hover:bg-blue-lit" : "bg-blue/60 hover:bg-blue"
                    }`}
                    title={view.canAdvance ? "Next slide (→)" : "Ask the chain again now — this wait is the contract's own clock"}
                  >
                    Next →
                  </button>
                </>
              )}
              <button
                onClick={onToggleSound}
                className="border-line/80 bg-ink/70 hover:border-mute/60 text-mute hover:text-bone rounded-full border px-3 py-1.5 text-[0.75rem] backdrop-blur-md transition-colors"
                aria-pressed={soundOn}
              >
                {soundOn ? "Sound on" : "Sound off"}
              </button>
              {view.running && (
                <button
                  onClick={onStop}
                  className="border-line/80 bg-ink/70 hover:border-blood/60 hover:text-blood text-mute rounded-full border px-3 py-1.5 text-[0.75rem] backdrop-blur-md transition-colors"
                >
                  Stop · Esc
                </button>
              )}
            </div>
          </div>

          {/* the refusal stamp */}
          {view.refused && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                key={view.refused}
                className="border-blood/80 text-blood bg-ink/70 -rotate-3 rounded-md border-2 px-6 py-3 text-center backdrop-blur-sm"
                style={{ animation: "stamp 0.55s var(--ease-out-quint) both" }}
              >
                <p className="font-mono text-[0.6875rem] tracking-[0.3em]">REFUSED ON-CHAIN</p>
                <p className="mt-1 text-[1.75rem] leading-none font-semibold tracking-tight">{view.refused}</p>
                <p className="text-blood/70 mt-1.5 text-[0.75rem]">premium refunded in the same transaction</p>
              </div>
            </div>
          )}

          {/* the caption */}
          <div className="absolute inset-x-0 bottom-[5.4vh] px-4 pb-4 md:px-8 md:pb-6">
            <div className="from-ink via-ink/85 to-transparent pointer-events-none absolute inset-x-0 -top-24 bottom-0 bg-gradient-to-t" />

            <div className="relative mx-auto max-w-3xl">
              {/* failure */}
              {view.error && (
                <div className="border-blood/40 bg-ink/85 pointer-events-auto rounded-xl border p-5 backdrop-blur-md">
                  <p className="kicker !text-blood">Something stopped the demo</p>
                  <p className="mt-2 text-[1.0625rem] leading-snug">{view.error}</p>
                  <div className="mt-4 flex gap-2.5">
                    <button onClick={onRestart} className="bg-blue hover:bg-blue-lit rounded-lg px-4 py-2.5 text-[0.875rem] font-medium text-white transition-colors">
                      Try again
                    </button>
                    <button onClick={onClose} className="border-line hover:border-mute/60 text-mute rounded-lg border px-4 py-2.5 text-[0.875rem] transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* the finale */}
              {view.done && view.result && (
                <div className="border-amber/40 bg-ink/85 pointer-events-auto rounded-xl border p-5 backdrop-blur-md md:p-6" style={{ animation: "rise 0.8s var(--ease-out-quint) both" }}>
                  <p className="kicker !text-amber">That was real, and it took {fmtTime(view.result.seconds)}</p>
                  <h3 className="display-md mt-2">Nobody filed a claim.</h3>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="kicker !text-[0.5625rem]">You paid</p>
                      <p className="tnum mt-1 text-[1.5rem] leading-none">{view.result.premium.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="kicker !text-[0.5625rem]">You were paid</p>
                      <p className="tnum text-amber mt-1 text-[1.5rem] leading-none">+{view.result.payout.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="kicker !text-[0.5625rem]">Return</p>
                      <p className="tnum text-mint mt-1 text-[1.5rem] leading-none">{mult.toFixed(1)}×</p>
                    </div>
                  </div>
                  {view.result.evmSkipped && <p className="text-mute mt-3 text-[0.8125rem]">{view.result.evmSkipped}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <button onClick={onRestart} className="bg-blue hover:bg-blue-lit rounded-lg px-4 py-2.5 text-[0.875rem] font-medium text-white transition-colors">
                      Run it again
                    </button>
                    <button onClick={onClose} className="border-line hover:border-mute/60 rounded-lg border px-4 py-2.5 text-[0.875rem] transition-colors">
                      Try it yourself
                    </button>
                    {view.tx.map((t) => (
                      <a key={t.url} href={t.url} target="_blank" rel="noreferrer noopener" className="text-blue-lit text-[0.8125rem] underline underline-offset-2">
                        {t.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* a chapter in progress */}
              {view.running && ch && (
                <div key={`${ch.n}:${ch.line}`} style={{ animation: "rise 0.7s var(--ease-out-quint) both" }}>
                  <p className="kicker !text-blue-lit">
                    Chapter {String(ch.n).padStart(2, "0")} / {String(view.total).padStart(2, "0")} · {ch.title}
                  </p>
                  <h3 className="display-md mt-2.5 max-w-[22ch] text-balance">{ch.line}</h3>
                  {ch.sub && <p className="text-mute mt-3 max-w-xl text-[1rem] leading-relaxed text-pretty">{ch.sub}</p>}

                  <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
                    {/* the three bids */}
                    {view.quotes && (
                      <div className="flex flex-wrap gap-2.5">
                        {view.quotes.map((q, i) => (
                          <div
                            key={q.name}
                            className={`rounded-lg border px-3.5 py-2.5 backdrop-blur-md ${
                              q.best ? "border-mint/60 bg-mint/10" : "border-line/80 bg-ink/70"
                            }`}
                            style={{ animation: `rise 0.6s var(--ease-out-quint) ${i * 160}ms both` }}
                          >
                            <p className="text-[0.75rem]">
                              {q.name}
                              {q.best && <span className="text-mint ml-2 text-[0.625rem] tracking-wider">BEST</span>}
                            </p>
                            <p className="tnum mt-1 text-[1.25rem] leading-none">{q.premium}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* three hits */}
                    {ch.n === 5 && (
                      <div className="flex items-center gap-2.5">
                        {[1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={`h-2.5 w-8 rounded-full transition-colors duration-300 ${i <= view.dumps ? "bg-blood" : "bg-white/15"}`}
                          />
                        ))}
                        <span className="text-mute ml-1 text-[0.8125rem]">dumps</span>
                      </div>
                    )}

                    {view.countdown && <Ring c={view.countdown} />}

                    {view.result && ch.n >= 8 && (
                      <div className="flex items-baseline gap-6">
                        <div>
                          <p className="kicker !text-[0.5625rem]">You paid</p>
                          <p className="tnum mt-1 text-[1.5rem] leading-none">{view.result.premium.toFixed(2)}</p>
                        </div>
                        <span className="text-mute">→</span>
                        <div>
                          <p className="kicker !text-[0.5625rem]">You were paid</p>
                          <p className="tnum text-amber mt-1 text-[1.75rem] leading-none">+{view.result.payout.toFixed(2)}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {view.tx.length > 0 && (
                    <div className="pointer-events-auto mt-4 flex flex-wrap gap-x-5 gap-y-1">
                      {view.tx.map((t) => (
                        <a key={t.url} href={t.url} target="_blank" rel="noreferrer noopener" className="text-mute hover:text-bone text-[0.75rem] underline underline-offset-2 transition-colors">
                          {t.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
