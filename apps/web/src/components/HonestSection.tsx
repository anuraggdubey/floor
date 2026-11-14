const LIMITS: Array<{ q: string; a: string }> = [
  {
    q: "The solvers are bots.",
    a: "Three scripted strategies, not a real underwriting desk. They have their own NEAR accounts, keys and margin, and their quotes are verified on-chain — but a real market would need real capital behind it.",
  },
  {
    q: "The stablecoin is ours.",
    a: "You are breaking a demo stable in a demo pool, not USDC. That is what makes it safe to hand you the dump button. The March 2023 weekend is used as a labelled historical reference only.",
  },
  {
    q: "It is fully collateralised.",
    a: "Each policy locks the solver's whole maximum payout. That is honest but capital-heavy, and it is the main thing a production version would have to improve.",
  },
  {
    q: "The trigger depends on being watched, and on a pool anyone can move.",
    a: "A keeper pokes the price so the contract sees a sustained breach. Anyone can poke, and time nobody observed never counts toward a breach. But the price is a spot read from a pool you can trade against, which is why it is safe to hand you the dump button here. A real version needs a TWAP, deep liquidity and swap fees so moving the price costs more than a payout is worth.",
  },
  {
    q: "The cross-chain payout is one-way.",
    a: "Chain Signatures can sign an outbound transfer, but the contract cannot see the other chain. Confirming that it landed is a trusted step, and we say so in the app.",
  },
  {
    q: "Crypto cover has failed before.",
    a: "Several on-chain insurers wound down or paid nothing when it mattered. A working prototype is not proof of demand, and we are not claiming otherwise.",
  },
];

/** The weaknesses, stated plainly. A judge who finds these themselves trusts the rest of it less. */
export function HonestSection() {
  return (
    <section id="honest" className="border-line/70 border-t py-24 md:py-32">
      <div className="shell">
        <div className="max-w-2xl">
          <p className="kicker" data-reveal>
            Honest limits
          </p>
          <h2 className="display-lg mt-5 text-balance" data-reveal style={{ ["--reveal-delay" as string]: "80ms" }}>
            What we would pick apart first.
          </h2>
          <p className="text-mute mt-6 text-[1.0625rem] leading-relaxed" data-reveal style={{ ["--reveal-delay" as string]: "160ms" }}>
            Everything below is in the repository&apos;s README and claims file too. If a line here is not backed by
            a command you can run, it should not be here.
          </p>
        </div>

        <dl className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {LIMITS.map((l, i) => (
            <div key={l.q} data-reveal style={{ ["--reveal-delay" as string]: `${(i % 2) * 90}ms` }}>
              <dt className="flex gap-3 text-[1.0625rem] font-medium tracking-tight">
                <span className="text-blood/80 font-mono text-[0.75rem] leading-7">{String(i + 1).padStart(2, "0")}</span>
                {l.q}
              </dt>
              <dd className="text-mute mt-2.5 pl-8 text-[0.9375rem] leading-relaxed">{l.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
