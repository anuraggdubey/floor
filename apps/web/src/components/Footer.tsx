import Link from "next/link";
import { LogoMark } from "./Logo";
import { Doorway } from "./Doorway";
import { Crowd } from "./Crowd";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: "Try it",
    links: [
      { label: "Break the peg", href: "/play" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Source", href: "https://github.com", external: true },
      { label: "What's verified", href: "/#honest" },
    ],
  },
  {
    title: "On NEAR",
    links: [
      { label: "Floor contract", href: "https://explorer.testnet.near.org/accounts/floorxa-floor.testnet", external: true },
      { label: "Peg pool", href: "https://explorer.testnet.near.org/accounts/floorxa-pool.testnet", external: true },
      { label: "fUSDC token", href: "https://explorer.testnet.near.org/accounts/floorxa-fusdc.testnet", external: true },
    ],
  },
  {
    title: "Built with",
    links: [
      { label: "NEAR Protocol", href: "https://near.org", external: true },
      { label: "Chain Signatures", href: "https://docs.near.org/chain-abstraction/chain-signatures", external: true },
      { label: "NEAR HACKATHON", href: "https://nearhackathon.com", external: true },
    ],
  },
];

/** The big blue closing act: an invitation, a doorway, and one button. */
export function PreFooter() {
  return (
    <section className="bg-blue relative overflow-hidden text-white">
      <div className="shell relative py-24 text-center md:py-32">
        <p className="kicker !text-white/60" data-reveal>
          The whole thing runs on NEAR testnet
        </p>
        <h2
          className="display-lg mx-auto mt-5 max-w-3xl text-balance text-white"
          data-reveal
          style={{ ["--reveal-delay" as string]: "80ms" }}
        >
          Walk in and break it yourself.
        </h2>
        <p
          className="mx-auto mt-5 max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-white/70"
          data-reveal
          style={{ ["--reveal-delay" as string]: "160ms" }}
        >
          No wallet, no seed phrase, no gas. You get a real NEAR account and demo money the moment you arrive.
        </p>

        <div className="mt-14 flex justify-center" data-reveal style={{ ["--reveal-delay" as string]: "240ms" }}>
          <Doorway className="w-full max-w-[26rem] drop-shadow-[0_28px_60px_rgba(0,0,0,0.45)]" />
        </div>

        <div className="mt-12" data-reveal style={{ ["--reveal-delay" as string]: "320ms" }}>
          <Link
            href="/play"
            className="group inline-flex items-center gap-2.5 rounded-[5px] border-t border-white/80 bg-[#dae0e5] px-8 py-4 text-[1.0625rem] font-semibold text-black shadow-[0_6px_0_0_#8f9aa3,0_18px_34px_rgba(0,0,0,0.35)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_0_0_#8f9aa3,0_22px_40px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_2px_0_0_#8f9aa3,0_10px_20px_rgba(0,0,0,0.3)]"
          >
            Break the peg
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-blue relative overflow-hidden text-white">
      <div className="shell relative z-10 pt-16 pb-10">
        <div className="grid gap-12 md:grid-cols-[1fr_2.2fr]">
          <div>
            <LogoMark className="h-12 w-12 text-white" animate={false} />
            <p className="mt-4 text-[0.9375rem] text-white/75">Built on NEAR</p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-[0.8125rem] text-white/60">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.external ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[0.9375rem] font-medium text-white transition-opacity hover:opacity-65"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="text-[0.9375rem] font-medium text-white transition-opacity hover:opacity-65">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-16 max-w-3xl text-[0.8125rem] leading-relaxed text-white/60">
          Floor runs on NEAR testnet with demo credits. The stablecoin, the pool and the solvers are simulated and
          labelled as such throughout. Nothing here is real money, an offer of insurance, or financial advice.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-white/60">
          <span>Testnet demo</span>
          <span>Built at NEAR HACKATHON 2026</span>
          <span>MIT licensed</span>
        </div>
      </div>

      {/* the room, watching */}
      <Crowd className="block h-[9rem] w-full md:h-[11rem]" />
    </footer>
  );
}
