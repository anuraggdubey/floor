"use client";

import { useLive } from "./LiveProvider";

const USES: Array<{ title: string; body: string; where: string }> = [
  {
    title: "The rules live in a contract",
    body: "The gate, the tiers, the sustain window and the settlement delay are all enforced in Rust on NEAR. The frontend cannot bend any of it — a late buyer is refused by the contract, not by the UI.",
    where: "contracts/floor",
  },
  {
    title: "Quotes are verified on-chain",
    body: "Each solver signs its quote with an ed25519 key. The contract checks that signature with env::ed25519_verify before it will lock anyone's margin, so a tampered premium simply fails.",
    where: "env::ed25519_verify",
  },
  {
    title: "Money moves as a real token",
    body: "Premiums, margin and payouts are NEP-141 transfers. Buying cover is one ft_transfer_call: the token hands the contract the premium and the signed quote together, and a refusal refunds in the same transaction.",
    where: "ft_transfer_call",
  },
  {
    title: "The price is read, not reported",
    body: "No oracle role and no admin feed. The contract makes a cross-contract call to the pool and reads the same price anyone else can move by trading against it.",
    where: "cross-contract call",
  },
  {
    title: "Payouts can leave NEAR",
    body: "The contract builds an EVM transfer itself, hashes it, and asks the NEAR MPC signer to sign it — so a payout can land on a chain NEAR does not live on, without a bridge.",
    where: "Chain Signatures",
  },
  {
    title: "Nobody needs a wallet",
    body: "Every visitor gets a real NEAR sub-account the moment they arrive, funded with demo credits. Custodial and testnet-only, and labelled that way in the app.",
    where: "sub-accounts",
  },
];

export function NearSection() {
  const live = useLive();
  const c = live.state?.contracts;

  return (
    <section id="near" className="border-line/70 border-t py-24 md:py-32">
      <div className="shell">
        <div className="max-w-2xl">
          <p className="kicker" data-reveal>
            On NEAR
          </p>
          <h2 className="display-lg mt-5 text-balance" data-reveal style={{ ["--reveal-delay" as string]: "80ms" }}>
            What the chain is actually doing here.
          </h2>
        </div>

        <div className="border-line/70 mt-14 grid gap-px overflow-hidden rounded-xl border bg-[color:var(--color-line)]/70 md:grid-cols-2 lg:grid-cols-3">
          {USES.map((u, i) => (
            <div
              key={u.title}
              className="bg-ink-2/80 hover:bg-ink-3/70 p-7 transition-colors duration-500"
              data-reveal
              style={{ ["--reveal-delay" as string]: `${(i % 3) * 80}ms` }}
            >
              <p className="font-mono text-[0.6875rem] tracking-wide text-blue-lit">{u.where}</p>
              <h3 className="mt-3 text-[1.125rem] font-medium tracking-tight">{u.title}</h3>
              <p className="text-mute mt-3 text-[0.9375rem] leading-relaxed">{u.body}</p>
            </div>
          ))}
        </div>

        {c && (
          <div className="mt-8 flex flex-wrap gap-2.5" data-reveal>
            {[
              { label: "floor", id: c.floor },
              { label: "peg-pool", id: c.pool },
              { label: "fUSDC", id: c.fusdc },
            ].map((x) => (
              <a
                key={x.id}
                href={`${c.explorer}/accounts/${x.id}`}
                target="_blank"
                rel="noreferrer noopener"
                className="border-line/80 bg-ink-2/60 hover:border-blue/60 hover:text-bone text-mute inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[0.75rem] transition-colors"
              >
                <span className="text-blue-lit">{x.label}</span>
                {x.id}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
