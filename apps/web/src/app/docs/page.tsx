import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DocsToc, type TocItem } from "@/components/DocsToc";

export const metadata: Metadata = {
  title: "Docs — Floor",
  description:
    "How Floor works: the cover lifecycle, the contracts, the AI underwriters, the cross-chain payout, the API, and how to run and verify it yourself.",
};

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "actors", label: "The moving parts" },
  { id: "lifecycle", label: "Cover lifecycle" },
  { id: "parameters", label: "Parameters" },
  { id: "guards", label: "Manipulation guards" },
  { id: "underwriters", label: "AI underwriters" },
  { id: "contracts", label: "Contracts" },
  { id: "near", label: "NEAR features" },
  { id: "crosschain", label: "Cross-chain payout" },
  { id: "timemachine", label: "Time machine" },
  { id: "api", label: "API reference" },
  { id: "proof", label: "On-chain proof" },
  { id: "run", label: "Run it yourself" },
  { id: "deploy", label: "Deploy" },
  { id: "limits", label: "Scope and limits" },
  { id: "faq", label: "FAQ" },
];

// ------------------------------------------------------------------ building blocks
function H2({ id, kicker, children }: { id: string; kicker: string; children: ReactNode }) {
  return (
    <header className="mb-6 scroll-mt-24" id={id}>
      <p className="kicker !text-blue-lit">{kicker}</p>
      <h2 className="display-md mt-3 text-balance">{children}</h2>
    </header>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-9 mb-3 text-[1.1875rem] font-medium tracking-tight">{children}</h3>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-mute mt-4 text-[1.0625rem] leading-relaxed text-pretty">{children}</p>;
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="text-mute mt-4 list-disc space-y-2 pl-5 text-[1.0625rem] leading-relaxed marker:text-[color:var(--color-line)]">{children}</ul>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="bg-ink-3 text-bone rounded px-1.5 py-0.5 font-mono text-[0.84em]">{children}</code>;
}

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="border-line/80 bg-ink-2/80 mt-5 overflow-hidden rounded-lg border">
      {label && <p className="kicker border-line/70 border-b px-4 py-2 !text-[0.625rem]">{label}</p>}
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed text-bone/90">{children}</pre>
    </div>
  );
}

function Callout({ title, tone = "info", children }: { title: string; tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={`mt-6 rounded-lg border p-4 ${
        tone === "warn" ? "border-amber/40 bg-amber/[0.05]" : "border-blue/40 bg-blue/[0.06]"
      }`}
    >
      <p className={`kicker !text-[0.625rem] ${tone === "warn" ? "!text-amber" : "!text-blue-lit"}`}>{title}</p>
      <div className="mt-2 text-[0.9688rem] leading-relaxed text-bone/85">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="border-line/80 mt-5 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.9375rem]">
        <thead>
          <tr className="border-line/80 bg-ink-2/80 border-b">
            {head.map((h) => (
              <th key={h} className="kicker px-4 py-3 font-normal !text-[0.625rem]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line/60 divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 leading-relaxed ${j === 0 ? "text-bone" : "text-mute"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-blue-lit underline underline-offset-2 hover:text-bone">
      {children}
    </a>
  );
}

const SECTION = "border-line/60 border-t pt-14 pb-2";

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="pt-28 pb-24">
        <div className="shell">
          {/* ------------------------------------------------------------- title */}
          <header className="max-w-3xl">
            <p className="kicker">Documentation</p>
            <h1 className="display-lg mt-5 text-balance">How Floor works.</h1>
            <p className="text-mute mt-6 max-w-2xl text-[1.1875rem] leading-relaxed text-pretty">
              Everything behind the demo: how a cover is priced, bought, triggered and paid, what each contract does, how to read the
              chain yourself, and how to run the whole thing on your own machine.
            </p>
          </header>

          <div className="mt-14 grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <DocsToc items={TOC} />
              </div>
            </aside>

            <article className="min-w-0 max-w-3xl space-y-0">
              {/* ----------------------------------------------------------- overview */}
              <section className="pb-2">
                <H2 id="overview" kicker="01 · Overview">
                  Depeg cover that pays itself.
                </H2>
                <P>
                  Floor is a market for stablecoin depeg cover on NEAR. A holder who is worried a stablecoin will lose its peg asks for a
                  quote. Several underwriters answer, each backing the cover with their own locked margin. If the peg really breaks and stays
                  broken, the contract pays the holder automatically. There is no claim form and no committee.
                </P>
                <P>
                  In March 2023 USDC traded near $0.87. Holders using it as treasury or collateral either took the loss or had no cover they
                  could buy in time. Pooled cover stays small because capital is scarce and risk is hard to price. Floor splits the job in
                  two: underwriters compete on price, and contracts enforce the rules and move the money.
                </P>
                <Table
                  head={["Question", "Answer"]}
                  rows={[
                    ["Who prices the risk?", "Competing underwriters, one signed quote each, per request."],
                    ["Who backs a policy?", "One underwriter, with margin locked in the contract for as long as the policy is open."],
                    ["Who decides a claim?", "Nobody. The contract reads the price and pays when the rules say so."],
                    ["What does it run on?", "NEAR testnet, plus Ethereum Sepolia for the optional cross-chain payout."],
                  ]}
                />
                <Callout title="Testnet demo" tone="warn">
                  Everything here uses demo credits on testnets. The stablecoin under test is a demo token, not real USDC, and nothing is
                  insurance or financial advice.
                </Callout>
              </section>

              {/* --------------------------------------------------------- quickstart */}
              <section className={SECTION}>
                <H2 id="quickstart" kicker="02 · Quickstart">
                  Try it in two minutes.
                </H2>
                <P>
                  Open <Link href="/play" className="text-blue-lit underline underline-offset-2 hover:text-bone">/play</Link>. The free backend
                  can take up to a minute to wake after a quiet spell, and the page says so while it does.
                </P>
                <H3>Option A: watch it happen</H3>
                <P>
                  Press <C>Watch it happen</C>. The demo runs the full story for you in about three minutes, with real transactions at every
                  step: account, quotes, purchase, activation, three dumps, a refused late buyer, the settle window, the payout, and the
                  Ethereum leg. <C>Next</C> (or the right arrow, Space or Enter) moves past a caption. While the demo waits on the
                  contract&apos;s own clock, Next re-checks the chain immediately instead of waiting for the next poll. <C>Step by step</C>{" "}
                  pauses on every slide.
                </P>
                <H3>Option B: drive it yourself</H3>
                <UL>
                  <li>
                    <strong className="text-bone font-medium">Get an account.</strong> One click creates a real NEAR testnet account funded
                    with demo credits. No wallet, no seed phrase, no gas.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Get quotes.</strong> Three AI underwriters read the live pool price, write their
                    reasoning and sign a quote.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Buy cover.</strong> The contract verifies the signature and locks that
                    underwriter&apos;s margin against your policy.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Break the peg.</strong> Press 25k three times. Each press is a real
                    transaction that sells demo stable into the pool and moves the price everyone reads.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Get paid.</strong> Once the price stays under a payout line long enough, the
                    contract pays you in fUSDC. Every step links to the NEAR explorer.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Optional.</strong> Register an Ethereum address and the contract also pays real
                    USDC on Ethereum Sepolia.
                  </li>
                </UL>
                <P>
                  The world on the left is the live state of the market. The water level is the peg, the lines cut into the wall are the
                  payout tiers, towers are underwriters, houses are policies. When something happens on chain, the scene acts it out.
                </P>
              </section>

              {/* -------------------------------------------------------------- actors */}
              <section className={SECTION}>
                <H2 id="actors" kicker="03 · Architecture">
                  The moving parts.
                </H2>
                <Code label="Flow">{`holder ──RFQ──▶ worker ──▶ 3 AI underwriters (own NEAR accounts, own margin, own ed25519 quote keys)
holder ◀── best signed quote
holder ──ft_transfer_call(premium + quote)──▶ floor contract
         verifies the ed25519 signature, applies the state gate, locks that underwriter's margin
peg-pool (dumpable demo stable) ──price──▶ floor: breach tracking per tier
price under a tier line for sustain_secs (+ settle_secs) ──▶ anyone calls trigger()
         pays the holder in fUSDC from the locked margin
         optional: asks the NEAR MPC signer to sign a USDC transfer on Ethereum Sepolia`}</Code>
                <Table
                  head={["Part", "What it is", "Can it move money?"]}
                  rows={[
                    [<C key="f">floor</C>, "The cover market contract. Verifies quotes, enforces the gate, tracks breaches, pays holders.", "Yes. It is the only place payouts are decided."],
                    [<C key="p">peg-pool</C>, "A dumpable demo stable pair. The peg price is read from it. Anyone can trade against it.", "Only its own demo tokens."],
                    [<C key="u">fusdc</C>, "NEP-141 demo money used for premiums, margin and payouts. Has a faucet.", "It is the money."],
                    ["Worker", "A Node service: price feed, RFQ and quote signing, keeper, arbitrage bot, EVM payout executor, HTTP API.", "No. It can only call what the contracts allow."],
                    ["Underwriters", "Three bots, each its own NEAR account with its own margin and quote key. An LLM picks the premium rate.", "Their margin is locked by the contract, not by them."],
                    ["Keeper", "A bot that pokes the price, activates policies, triggers and expires them. Anyone could do this.", "No. Contract rules still apply."],
                    ["Arbitrage bot", "Buys the peg back after a breach, and sells it back down if the pool sits above $1.02.", "Trades demo tokens so every demo run ends."],
                    ["Web app", "Next.js: landing page, /play, /time-machine and these docs.", "No. Guest keys live on the worker."],
                  ]}
                />
              </section>

              {/* ----------------------------------------------------------- lifecycle */}
              <section className={SECTION}>
                <H2 id="lifecycle" kicker="04 · Lifecycle">
                  From quote to payout.
                </H2>
                <H3>1. Ask for cover</H3>
                <P>
                  A holder sends a request for quote: how much to cover (100, 250 or 500 fUSDC in the app) and for how long (up to ten
                  minutes). The worker asks each underwriter. An underwriter either signs a quote or declines with a reason. The cheapest
                  quote is flagged best.
                </P>
                <H3>2. Buy</H3>
                <P>
                  The holder pays the premium with <C>ft_transfer_call</C>, attaching the signed quote. The contract checks the signature,
                  that the quote has not been used before, that the state gate is open, and that the underwriter has enough free margin. If
                  everything holds, the premium is taken and that underwriter&apos;s margin is locked against the policy. If anything fails,
                  the full premium is refunded in the same transaction.
                </P>
                <H3>3. Pending, then Active</H3>
                <P>
                  A new policy is <C>Pending</C> for a short wait so nobody can buy cover while the ground is already moving. After the wait
                  the keeper calls <C>activate</C>. If the peg is still healthy the policy becomes <C>Active</C>. If not, it is{" "}
                  <C>Void</C> and the premium is refunded.
                </P>
                <H3>4. Break, hold, settle</H3>
                <P>
                  While a policy is Active, the contract tracks how long the price stays under each tier line. Only a sustained breach counts:
                  the price must stay under a line for <C>sustain_secs</C>, then a further <C>settle_secs</C> must pass before the payout is
                  fixed. The settle delay stops anyone locking in the shallowest tier by triggering early. The payout is for the deepest tier
                  that was held.
                </P>
                <H3>5. Pay</H3>
                <P>
                  Anyone can call <C>trigger</C>. The contract pays the holder from the locked margin, releases whatever is left back to the
                  underwriter, and, if the holder registered an Ethereum address, reserves a capped USDC payout on Sepolia.
                </P>
                <Table
                  head={["State", "Meaning"]}
                  rows={[
                    [<C key="a">Pending</C>, "Bought, waiting out the short delay before cover starts."],
                    [<C key="b">Active</C>, "Cover is live. The contract is watching for a sustained breach."],
                    [<C key="c">Triggered</C>, "A tier held long enough. The payout is being sent."],
                    [<C key="d">PaidOut</C>, "The holder has been paid. Remaining margin is released."],
                    [<C key="e">Expired</C>, "The tenor ended with no sustained breach. The underwriter keeps the premium."],
                    [<C key="f">Void</C>, "Activation failed the gate. The premium was refunded."],
                  ]}
                />
                <Callout title="Worked example">
                  A guest buys 100 fUSDC of cover for a 0.60 fUSDC premium. Three presses of the 25k dump take the peg from $1.00 to about
                  $0.87, below every tier line. After the hold and settle windows the deepest tier pays 15% of cover: 15.00 fUSDC, a 25× return
                  on the premium. In the same run, 5 USDC lands on Ethereum Sepolia.
                </Callout>
              </section>

              {/* ---------------------------------------------------------- parameters */}
              <section className={SECTION}>
                <H2 id="parameters" kicker="05 · Parameters">
                  The rules, as set on chain.
                </H2>
                <P>
                  These are the values the deployed contract is running right now. Read them yourself with{" "}
                  <C>get_params</C>. The owner cannot change them while any cover is live.
                </P>
                <Table
                  head={["Parameter", "Value", "What it does"]}
                  rows={[
                    [<C key="1">band</C>, "$0.995", "Cover can only be bought while the price is at or above this line."],
                    [<C key="2">tier 1</C>, "below $0.97 → 3%", "Payout as a share of cover if this line is held."],
                    [<C key="3">tier 2</C>, "below $0.93 → 8%", "Deeper break, bigger payout."],
                    [<C key="4">tier 3</C>, "below $0.90 → 15%", "The deepest tier."],
                    [<C key="5">sustain_secs</C>, "30 s", "How long the price must stay under a line to count."],
                    [<C key="6">settle_secs</C>, "30 s", "Extra wait after that before the payout is fixed."],
                    [<C key="7">lookback_secs</C>, "120 s", "After any breach, cover stays closed for this long, even if the peg recovers."],
                    [<C key="8">wait_secs</C>, "20 s", "The Pending delay before a new policy can activate."],
                    [<C key="9">stale_secs</C>, "60 s", "A price older than this cannot be used, and a gap this long resets every breach clock."],
                    [<C key="10">max_tenor_secs</C>, "600 s", "The longest cover a quote can be for."],
                    [<C key="11">exposure_cap</C>, "1,000,000 fUSDC", "The most cover the market can have open at once."],
                  ]}
                />
                <P>
                  The windows are short on purpose so a demo finishes in minutes. A real deployment would use hours or days, a time-weighted
                  price and deep liquidity.
                </P>
              </section>

              {/* -------------------------------------------------------------- guards */}
              <section className={SECTION}>
                <H2 id="guards" kicker="06 · Safety rules">
                  Manipulation guards.
                </H2>
                <P>
                  The price comes from a pool anyone can trade against, so the contract is built to refuse the obvious tricks. Each of these
                  is enforced in the contract and covered by tests.
                </P>
                <UL>
                  <li>
                    <strong className="text-bone font-medium">State gate.</strong> Cover can only be bought while the price is in the band, with
                    no breach in the lookback window, and a policy activates only after its wait. Late buyers are refused on chain with{" "}
                    <C>GATE_CLOSED</C> and refunded.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Sustained breach.</strong> A flash dump that recovers pays nothing. The price must
                    hold under a line for the sustain window.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Settlement delay.</strong> Nobody can lock the shallowest tier by triggering early.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Breach continuity.</strong> Time nobody observed never counts. If the previous
                    price observation is older than <C>stale_secs</C>, every breach clock restarts. Poking low, letting it recover unseen, and
                    poking low again later cannot fake a breach.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Live cover is fixed.</strong> The owner cannot change the tier schedule while any
                    policy is open (<C>POLICIES_LIVE</C>).
                  </li>
                  <li>
                    <strong className="text-bone font-medium">No forged or replayed quotes.</strong> Quotes are ed25519 signatures checked in
                    the contract. A used quote cannot be used again.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">One signature per EVM payout.</strong> A payout that is already being signed can
                    only be retried with the same nonce, so it can never end up as two mineable transactions.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Full collateral.</strong> Every policy is backed one-to-one by locked margin, so
                    a payout can never exceed what was set aside.
                  </li>
                </UL>
              </section>

              {/* -------------------------------------------------------- underwriters */}
              <section className={SECTION}>
                <H2 id="underwriters" kicker="07 · Underwriters">
                  AI agents with money at stake.
                </H2>
                <P>
                  There are three underwriters, each its own NEAR account with its own margin and its own ed25519 key for signing quotes. Each
                  one reads the live price, the recent history and its own capacity, writes a short reason, and chooses a premium rate.
                </P>
                <Table
                  head={["Underwriter", "Style"]}
                  rows={[
                    ["Aggressive", "Aims for the cheapest premium to win the business."],
                    ["Volatility", "Reads the recent deviation from the peg and refuses when it is large."],
                    ["History", "Reads how the peg has behaved recently before it names a premium."],
                  ]}
                />
                <UL>
                  <li>
                    The language model (Groq, <C>openai/gpt-oss-120b</C>) only chooses a <strong className="text-bone font-medium">premium rate</strong>,
                    clamped to hard bounds of 40 to 400 basis points. It can also refuse.
                  </li>
                  <li>
                    The contract decides everything that moves money. A model that misbehaves cannot spend margin it does not have, and its
                    quote still has to pass signature, gate and capacity checks.
                  </li>
                  <li>
                    While the peg is breaking, every underwriter declines. That is the market working: nobody sells cover into a fire.
                  </li>
                  <li>
                    If the model is slow or unusable, a scripted strategy answers and the offer is labelled <C>scripted</C> in the app, so you
                    can always tell which quotes came from an AI.
                  </li>
                </UL>
              </section>

              {/* ----------------------------------------------------------- contracts */}
              <section className={SECTION}>
                <H2 id="contracts" kicker="08 · Contracts">
                  Three Rust contracts.
                </H2>
                <P>
                  All three are written in Rust with near-sdk 5 and live on NEAR testnet. The source is in the <C>contracts/</C> folder of the
                  repository, together with a sandbox integration test that runs the full lifecycle.
                </P>
                <Table
                  head={["Contract", "Account", "Role"]}
                  rows={[
                    [
                      <C key="f">floor</C>,
                      <A key="fa" href="https://testnet.nearblocks.io/address/floorxa-floor.testnet">floorxa-floor.testnet</A>,
                      "Cover market: quote verification, gate, breach tracking, triggers, payouts, EVM payout.",
                    ],
                    [
                      <C key="p">peg-pool</C>,
                      <A key="pa" href="https://testnet.nearblocks.io/address/floorxa-pool.testnet">floorxa-pool.testnet</A>,
                      "Dumpable demo stable pair that the price comes from.",
                    ],
                    [
                      <C key="u">fusdc</C>,
                      <A key="ua" href="https://testnet.nearblocks.io/address/floorxa-fusdc.testnet">floorxa-fusdc.testnet</A>,
                      "NEP-141 demo money with a faucet.",
                    ],
                  ]}
                />
                <H3>The floor contract</H3>
                <UL>
                  <li>Receives premiums and margin deposits through <C>ft_on_transfer</C>, and refunds anything it rejects.</li>
                  <li>Keeps each underwriter&apos;s free and locked margin, and each policy&apos;s state.</li>
                  <li>Reads the price from the pool and keeps the gate and per-tier breach clocks.</li>
                  <li>Pays holders in fUSDC and reserves capped Ethereum payouts.</li>
                  <li>Exposes plain view methods for everything: <C>get_params</C>, <C>get_gate</C>, <C>get_pool_stats</C>, <C>get_policy</C>, <C>list_policies</C>, <C>list_solvers</C>, <C>get_sustained_log</C>, <C>get_evm_chain</C>, <C>list_evm_payouts</C>.</li>
                </UL>
                <Code label="Read the live state yourself, no keys needed">{`near contract call-function as-read-only floorxa-floor.testnet get_pool_stats json-args '{}' network-config testnet now
near contract call-function as-read-only floorxa-floor.testnet get_params json-args '{}' network-config testnet now
near contract call-function as-read-only floorxa-floor.testnet get_policy json-args '{"policy_id":11}' network-config testnet now`}</Code>
              </section>

              {/* ---------------------------------------------------------------- near */}
              <section className={SECTION}>
                <H2 id="near" kicker="09 · Built on NEAR">
                  NEAR features used.
                </H2>
                <Table
                  head={["Feature", "Where it is used"]}
                  rows={[
                    ["Own Rust contracts (near-sdk 5)", "floor, peg-pool and fusdc."],
                    ["NEP-141 with ft_transfer_call / ft_on_transfer", "Premiums, margin deposits and refunds."],
                    ["env::ed25519_verify", "floor rejects forged and replayed quotes."],
                    ["Cross-contract calls and callbacks", "Price reads, payouts, and retry on failure."],
                    [
                      "Chain Signatures (MPC)",
                      "floor builds an Ethereum USDC transfer itself and asks v1.signer-prod.testnet to sign it. No bridge.",
                    ],
                  ]}
                />
                <P>
                  Each guest in the demo is a real NEAR testnet sub-account created for you, so every action you take is a real signed
                  transaction you can open in the explorer.
                </P>
              </section>

              {/* ------------------------------------------------------- cross-chain */}
              <section className={SECTION}>
                <H2 id="crosschain" kicker="10 · Cross-chain">
                  A payout on Ethereum, with no bridge.
                </H2>
                <P>
                  If a holder has registered an Ethereum address, a triggered policy also reserves a USDC payout on Ethereum Sepolia. The
                  contract does the work:
                </P>
                <UL>
                  <li>
                    It builds the Ethereum transaction itself, checks it against its own state, and hashes it. Its RLP and keccak output
                    matches viem byte for byte, and a test proves it.
                  </li>
                  <li>
                    It asks the NEAR signer, <C>v1.signer-prod.testnet</C>, to sign that hash. The signing key is derived from the Floor
                    contract&apos;s own account, so only contract logic can ask for it.
                  </li>
                  <li>
                    The worker broadcasts the signed transaction and reports back, and the contract marks the payout confirmed.
                  </li>
                </UL>
                <Table
                  head={["Setting", "Value"]}
                  rows={[
                    ["Chain", "Ethereum Sepolia (chain id 11155111)"],
                    ["Token", <C key="t">0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238</C>],
                    ["Derivation path", <C key="d">floor-pool-1</C>],
                    ["Cap per payout", "5 USDC"],
                    ["Paying address", <C key="a">0xf41988ac6391F4657fB8B9d652bc4e130f994F24</C>],
                  ]}
                />
                <Callout title="Trust assumptions" tone="warn">
                  The leg is outbound only. The contract cannot read Ethereum, so it relies on a trusted executor to report that the
                  transaction was mined, and the MPC committee is a trust assumption of Chain Signatures itself. Every payout is capped.
                </Callout>
              </section>

              {/* --------------------------------------------------------- time machine */}
              <section className={SECTION}>
                <H2 id="timemachine" kicker="11 · Time machine">
                  Replay the real crash.
                </H2>
                <P>
                  <Link href="/time-machine" className="text-blue-lit underline underline-offset-2 hover:text-bone">/time-machine</Link> replays
                  the March 2023 USDC and USDT depeg, using Binance 15-minute candles, against the same cover market. Three underwriters decide
                  whether to back a 100 USDC cover, refuse as the price falls, and show what a backtested cover would have paid the person who
                  bought it.
                </P>
                <P>
                  It is a simulation on real data. No transaction is made, and the chart is labelled as historical reference rather than a
                  live feed.
                </P>
              </section>

              {/* ----------------------------------------------------------------- api */}
              <section className={SECTION}>
                <H2 id="api" kicker="12 · API">
                  Worker HTTP API.
                </H2>
                <P>
                  The web app talks to the worker over plain JSON. Write endpoints that act as a guest need the <C>x-guest-token</C> header
                  returned by <C>/api/guest</C>. Write endpoints are paced per guest, and new guest accounts are capped globally.
                </P>
                <Table
                  head={["Method", "Path", "What it does"]}
                  rows={[
                    ["GET", <C key="1">/api/health</C>, "Is the worker up, how old is the price, how many guests exist."],
                    ["GET", <C key="2">/api/state</C>, "Contracts, parameters, live price, gate state, price history, pool stats and the underwriter book."],
                    ["GET", <C key="3">/api/stream</C>, "Server-sent events: prices, dumps, quotes, purchases, policy changes and keeper actions as they happen."],
                    ["POST", <C key="4">/api/guest</C>, "Create a funded NEAR testnet guest account. Returns a token."],
                    ["GET", <C key="5">/api/me</C>, "The guest's balances."],
                    ["POST", <C key="6">/api/faucet</C>, "Top up the guest's demo credits."],
                    ["POST", <C key="7">/api/rfq</C>, "Ask the underwriters for quotes for a cover size and tenor."],
                    ["POST", <C key="8">/api/buy</C>, "Buy cover with one of the returned quotes. The response says whether the contract accepted or refused it."],
                    ["POST", <C key="9">/api/dump</C>, "Sell demo stable into the pool (1 to 100,000 dUSD per press)."],
                    ["GET", <C key="10">/api/policies</C>, "All policies, or one holder's with ?holder=."],
                    ["GET", <C key="11">/api/evm</C>, "Cross-chain leg: chain info, funding, the guest's payout address and recent payouts."],
                    ["POST", <C key="12">/api/payout-address</C>, "Register the Ethereum address that gets the cross-chain payout."],
                  ]}
                />
                <Code label="Example: ask for quotes">{`curl -X POST https://floor-p17j.onrender.com/api/rfq \\
  -H 'content-type: application/json' \\
  -H 'x-guest-token: <token from /api/guest>' \\
  -d '{"notional": 100, "tenor_secs": 300}'`}</Code>
                <P>
                  The live backend is at <A href="https://floor-p17j.onrender.com/api/health">floor-p17j.onrender.com</A>. It runs on a free
                  host, so after a quiet spell the first request can take up to a minute while it wakes.
                </P>
              </section>

              {/* --------------------------------------------------------------- proof */}
              <section className={SECTION}>
                <H2 id="proof" kicker="13 · Proof">
                  On-chain proof.
                </H2>
                <P>
                  The deployed code hashes match the repository. The Floor contract was upgraded in place with its state kept, so every policy,
                  margin and payout in its history is on the same account.
                </P>
                <Table
                  head={["Contract", "Deployed code hash"]}
                  rows={[
                    [<C key="f">floor</C>, <C key="fh">9cts95HgbR4cpUDDjeGrUhmmkaAuHM1vodaCdT1RAbgM</C>],
                    [<C key="p">peg-pool</C>, <C key="ph">9A4xxa9wiF5uyPhA7izEWjme2S77ovZCNxrcJYn4fuW6</C>],
                    [<C key="u">fusdc</C>, <C key="uh">68sTUKw9B3s8bjR3GtkohVtdaduZSXzJke4srhqYqYCk</C>],
                  ]}
                />
                <H3>One full cycle, policy #11</H3>
                <Table
                  head={["Step", "Transaction"]}
                  rows={[
                    [
                      "Buy: signed quote verified, solver margin locked, premium 0.60",
                      <A key="1" href="https://testnet.nearblocks.io/txns/CFrqwjyFbq2g4yawFXq6eojqbZH9bMEiMCnNxExkAxb3">CFrqwjyF…xAb3</A>,
                    ],
                    [
                      "A late buyer is refused on chain (GATE_CLOSED) and refunded",
                      <A key="2" href="https://testnet.nearblocks.io/txns/E7NDVYi4tSZedvVtqkf4oi695NBbhGtewSFNinP9ykNk">E7NDVYi4…9ykNk</A>,
                    ],
                    [
                      "Sustained breach: trigger pays the holder 15.00 fUSDC",
                      <A key="3" href="https://testnet.nearblocks.io/txns/DMQj7VQH5sSx9w1eyX8wagq1uyaJ2Lg9h3sPCpRdtJk4">DMQj7VQH…tJk4</A>,
                    ],
                    [
                      "Cross-chain leg: Chain Signatures signs, 5.00 USDC lands on Sepolia",
                      <A key="4" href="https://sepolia.etherscan.io/tx/0x22fe00940d020c6b0f776445ed102c478e1a4b8bfcbc8425672306095c835b03">0x22fe0094…5b03</A>,
                    ],
                  ]}
                />
                <P>
                  Every claim the project makes has a row in <A href="https://github.com/anuraggdubey/floor/blob/main/docs/CLAIMS.md">docs/CLAIMS.md</A> with
                  the command that proves it.
                </P>
              </section>

              {/* ----------------------------------------------------------------- run */}
              <section className={SECTION}>
                <H2 id="run" kicker="14 · Run it yourself">
                  Verify it on your machine.
                </H2>
                <P>
                  Use Linux, macOS or WSL (on Windows, use WSL). You need Rust with the <C>wasm32-unknown-unknown</C> target,{" "}
                  <C>cargo-near</C>, <C>near-cli-rs</C>, Node 24, pnpm 10 and <C>make</C>.
                </P>
                <Code label="Offline: no keys, no network">{`make doctor    # toolchain check, every line should say PASS
make setup     # pnpm install
make verify    # contract tests, a local-sandbox lifecycle, worker tests. Ends with ALL PASS`}</Code>
                <Code label="Against NEAR testnet">{`cp .env.example .env     # fill it in, see docs/SETUP.md
make worker              # API on :8787
make web                 # app on :3000
make e2e                 # the full testnet story, about 4 minutes`}</Code>
                <Table
                  head={["Folder", "What is in it"]}
                  rows={[
                    [<C key="1">contracts/</C>, "Rust NEAR contracts and sandbox integration tests."],
                    [<C key="2">apps/web</C>, "Next.js app: landing page, /play, /time-machine and these docs."],
                    [<C key="3">apps/worker</C>, "Price feed, keeper, underwriters, arbitrage bot, EVM payout executor, HTTP API."],
                    [<C key="4">docs/</C>, "SETUP, DEPLOY, CLAIMS, spikes, evidence and screenshots."],
                    [<C key="5">scripts/</C>, "End-to-end and helper scripts."],
                  ]}
                />
                <H3>Configuration</H3>
                <P>
                  Keys live only in <C>.env</C> and host environment variables, never in git. The main settings:
                </P>
                <Table
                  head={["Variable", "Purpose"]}
                  rows={[
                    [<C key="1">NEAR_RPC_URL</C>, "The NEAR RPC to use first."],
                    [<C key="2">NEAR_RPC_URLS</C>, "Optional comma-separated extra endpoints, tried before the built-in fallbacks. A keyed FastNEAR URL is the best fix for rate limits."],
                    [<C key="3">GROQ_API_KEY</C>, "Turns the underwriters into LLM agents. Without it they run scripted and are labelled so."],
                    [<C key="4">EVM_RPC_URL</C>, "Turns on the cross-chain payout leg. Leave empty to turn it off."],
                    [<C key="5">PAYOUT_CAP_USDC / PAYOUT_DAILY_CAP_USDC</C>, "Per-payout and daily limits for the Ethereum leg (5 and 50 by default)."],
                    [<C key="6">MAX_GUESTS</C>, "Global cap on guest accounts (60 by default)."],
                    [<C key="7">WEB_ORIGIN</C>, "The web app's origin, for CORS on a hosted worker."],
                  ]}
                />
              </section>

              {/* -------------------------------------------------------------- deploy */}
              <section className={SECTION}>
                <H2 id="deploy" kicker="15 · Deploy">
                  Free hosting.
                </H2>
                <UL>
                  <li>
                    <strong className="text-bone font-medium">Web app on Vercel.</strong> Set <C>NEXT_PUBLIC_API_URL</C> to the worker&apos;s
                    URL so the browser and the event stream talk to it directly.
                  </li>
                  <li>
                    <strong className="text-bone font-medium">Worker on Render.</strong> Node 24, with the environment variables from{" "}
                    <C>.env</C>. Set <C>WEB_ORIGIN</C> to the Vercel URL.
                  </li>
                  <li>
                    The worker reads the client address from the edge-set <C>True-Client-IP</C> header (not the spoofable{" "}
                    <C>X-Forwarded-For</C>), caches state for two seconds, caps live streams, and paces writes per guest.
                  </li>
                </UL>
                <P>
                  Step by step instructions are in <A href="https://github.com/anuraggdubey/floor/blob/main/docs/DEPLOY.md">docs/DEPLOY.md</A>.
                </P>
              </section>

              {/* -------------------------------------------------------------- limits */}
              <section className={SECTION}>
                <H2 id="limits" kicker="16 · Honest limits">
                  What this is, and is not.
                </H2>
                <UL>
                  <li>Testnet only, with demo credits. Not regulated insurance.</li>
                  <li>The peg is a demo stable (dUSD), not USDC. The March 2023 chart is a labelled historical reference.</li>
                  <li>
                    Cover is fully collateralised per policy, and fixed partial payouts do not cover a total collapse.
                  </li>
                  <li>
                    The trigger relies on price pokes landing inside the sustain window. The price is a spot read from a pool anyone can trade
                    against, which is why handing out the dump button is safe here. A real version needs a time-weighted price, deep liquidity
                    and swap fees.
                  </li>
                  <li>
                    A quote signature does not yet bind the contract account, so a quote could in principle be replayed against a second
                    deployment of the same contract.
                  </li>
                  <li>
                    The Ethereum leg is outbound only and capped at 5 USDC. It relies on a trusted executor and on the MPC committee.
                  </li>
                  <li>
                    Guest accounts are custodial and testnet only: the server holds the key. Never use one for anything real.
                  </li>
                  <li>
                    Floor runs its own quote flow. It does not claim that NEAR&apos;s swap solvers underwrite cover.
                  </li>
                </UL>
                <H3>Where it goes next</H3>
                <UL>
                  <li>Bind the quote signature to the contract account.</li>
                  <li>A time-weighted price source, swap fees and deeper liquidity.</li>
                  <li>Real USDC with a real pool.</li>
                  <li>Underwriter reputation and margin-efficiency tracking, so better pricers win more flow.</li>
                  <li>Inbound Ethereum confirmation, so the cross-chain leg no longer relies on a trusted executor.</li>
                </UL>
              </section>

              {/* ----------------------------------------------------------------- faq */}
              <section className={SECTION}>
                <H2 id="faq" kicker="17 · FAQ">
                  Questions people ask.
                </H2>
                <H3>Is any of this real money?</H3>
                <P>No. Every token is a testnet demo token and every account is a testnet account. The transactions are real on testnet, which is why you can open them.</P>
                <H3>Why does the first load take a while?</H3>
                <P>
                  The backend runs on a free host that sleeps when idle. The page tells you when it is waking, and it comes back within about a minute.
                </P>
                <H3>Why did a purchase get refused?</H3>
                <P>
                  The contract refuses cover while the peg is under stress and for a window afterwards (<C>GATE_CLOSED</C>), or when an
                  underwriter has no free margin. In every case the premium is refunded in the same transaction.
                </P>
                <H3>Why did the underwriters all decline?</H3>
                <P>
                  After a sharp fall they see the deviation and refuse to quote. That is the market working, and it is the same reason you
                  cannot buy a fire policy while the house is burning.
                </P>
                <H3>Why was nothing paid after I pressed the dump button?</H3>
                <P>
                  A payout needs an active policy and a price that stays under a payout line for the full sustain and settle windows. A dump
                  that recovers quickly pays nothing, by design.
                </P>
                <H3>Is the AI actually deciding?</H3>
                <P>
                  Yes, within bounds. The model picks each underwriter&apos;s premium rate and can refuse, but it cannot move money. The
                  contract checks every quote, and a quote from the scripted fallback is labelled <C>scripted</C>.
                </P>
                <H3>Where is the code?</H3>
                <P>
                  <A href="https://github.com/anuraggdubey/floor">github.com/anuraggdubey/floor</A>, MIT licensed. Built at NEAR HACKATHON 2026
                  between 1 and 14 November 2026.
                </P>
              </section>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
