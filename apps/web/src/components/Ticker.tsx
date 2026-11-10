"use client";

const WORDS = [
  "NO CLAIM FORM",
  "NO COMMITTEE",
  "NO BRIDGE",
  "NO ORACLE ROLE",
  "NO WALLET",
  "NO GAS",
  "JUST THE CONTRACT",
];

/** A moving band between acts. Duplicated once so the loop is seamless at translateX(-50%). */
export function Ticker() {
  const line = [...WORDS, ...WORDS];
  return (
    <section className="border-line/70 bg-ink-2/50 overflow-hidden border-y py-5" aria-hidden="true">
      <div className="flex w-max" style={{ animation: "marquee 34s linear infinite" }}>
        {line.map((w, i) => (
          <span key={i} className="flex shrink-0 items-center">
            <span className="px-7 font-mono text-[0.8125rem] tracking-[0.26em] whitespace-nowrap text-mute">{w}</span>
            <span className="bg-blue/70 h-1 w-1 rounded-full" />
          </span>
        ))}
      </div>
    </section>
  );
}
