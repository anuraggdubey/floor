"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, usdc, shortTx, type Offer, type Policy, type RfqResult } from "@/lib/api";

/** Drop a ripple where the pointer landed; it cleans itself up once the animation ends. */
function ripple(e: ReactPointerEvent<HTMLElement>) {
  const host = e.currentTarget;
  const r = host.getBoundingClientRect();
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.setProperty("--rx", `${e.clientX - r.left}px`);
  s.style.setProperty("--ry", `${e.clientY - r.top}px`);
  s.addEventListener("animationend", () => s.remove(), { once: true });
  host.appendChild(s);
}
import type { Live } from "@/lib/useFloor";
import type { Guest } from "@/lib/useGuest";

export function Panel({
  title,
  step,
  children,
  tone = "default",
}: {
  title: string;
  step?: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      onPointerMove={(e) => {
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        el.style.setProperty("--mx", `${px}px`);
        el.style.setProperty("--my", `${py}px`);
        if (e.pointerType === "mouse") {
          // a couple of degrees, away from the pointer, like a card resting on a fingertip
          el.style.setProperty("--rx", `${((px / r.width - 0.5) * 3).toFixed(2)}deg`);
          el.style.setProperty("--ry", `${((0.5 - py / r.height) * 3).toFixed(2)}deg`);
        }
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.setProperty("--rx", "0deg");
        e.currentTarget.style.setProperty("--ry", "0deg");
      }}
      className={`glow tilt rounded-xl border p-5 ${
        tone === "danger" ? "border-blood/30 bg-blood/[0.04]" : "border-line/80 bg-ink-2/70"
      }`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        {step && (
          <span
            className={`font-mono text-[0.625rem] ${tone === "danger" ? "text-blood" : "text-blue-lit"}`}
          >
            {step}
          </span>
        )}
        <h2 className="text-[0.9375rem] font-medium tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ buy flow
export function BuyPanel({ live, guest }: { live: Live; guest: Guest }) {
  const [notional, setNotional] = useState(100);
  const [rfq, setRfq] = useState<RfqResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string; tx?: string } | null>(null);

  const tenor = Math.min(600, live.state?.params.max_tenor_secs ?? 600);
  const tiers = live.state?.params.tiers ?? [];
  const maxPayoutFrac = tiers.length ? tiers[tiers.length - 1]!.payout_bps / 10_000 : 0.15;
  const disabled = !guest.accountId;

  async function getQuotes() {
    setBusy("quote");
    setMsg(null);
    setRfq(null);
    try {
      setRfq(await api.rfq(notional, tenor));
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function buy(o: Offer) {
    if (!rfq) return;
    setBusy(o.solver);
    setMsg(null);
    try {
      const r = await api.buy(rfq.rfq_id, o.solver);
      if (r.ok) {
        setMsg({ tone: "good", text: `Policy #${r.policy_id} created on NEAR`, tx: r.tx });
        setRfq(null);
        void guest.refresh();
      } else {
        setMsg({
          tone: "bad",
          text:
            r.rejected === "GATE_CLOSED"
              ? "Refused on-chain: the peg is already under stress. Premium refunded."
              : `Refused on-chain: ${r.rejected ?? r.error ?? "failed"}. Premium refunded.`,
          tx: r.tx,
        });
      }
      void live.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Buy cover" step="01">
      <label className="text-mute block text-[0.8125rem]">Amount to cover</label>
      <div className="mt-2 flex gap-2">
        {[100, 250, 500].map((v) => (
          <button
            key={v}
            onClick={() => setNotional(v)}
            className={`tnum flex-1 rounded-lg border py-2.5 text-[0.9375rem] transition-colors ${
              notional === v ? "border-blue bg-blue/15 text-bone" : "border-line text-mute hover:border-mute/60"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <p className="text-mute/70 mt-2 text-[0.75rem]">
        fUSDC · pays up to {usdc(notional * 1e6 * maxPayoutFrac, 0)} at the deepest tier
      </p>

      <button
        onPointerDown={ripple}
        onClick={getQuotes}
        disabled={disabled || busy !== null}
        className="ripple-host bg-blue hover:bg-blue-lit mt-4 w-full rounded-lg py-3 text-[0.9375rem] font-medium text-white transition-[background-color,box-shadow] duration-300 hover:shadow-[0_10px_28px_rgba(30,110,243,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "quote" ? "Asking solvers…" : "Get quotes"}
      </button>

      {rfq && (
        <div className="mt-4 space-y-2">
          {rfq.offers.map((o, i) => (
            <button
              key={o.solver}
              onPointerDown={ripple}
              onClick={() => void buy(o)}
              disabled={busy !== null}
              style={{ animation: `rise 0.6s var(--ease-out-quint) ${i * 90}ms both` }}
              className={`ripple-host group flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-[background-color,border-color,translate] duration-300 hover:-translate-y-px disabled:opacity-50 ${
                o.solver === rfq.best
                  ? "border-mint/50 bg-mint/[0.07] hover:bg-mint/[0.12]"
                  : "border-line hover:border-mute/60"
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
                  {o.name}
                  {o.solver === rfq.best && (
                    <span className="bg-mint/15 text-mint rounded px-1.5 py-0.5 text-[0.625rem]">BEST</span>
                  )}
                </p>
                <p className="text-mute/70 truncate font-mono text-[0.6875rem]">
                  {o.ai ? <span className="text-blue-lit">AI agent · {o.latency_ms}ms</span> : "scripted"} · {o.solver}
                </p>
                {o.thought && <p className="text-bone/75 mt-1.5 text-[0.8125rem] leading-snug italic">“{o.thought}”</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-[1.0625rem] leading-tight">{usdc(o.premium)}</p>
                <p className="text-mute text-[0.6875rem]">premium</p>
                <p className="text-mint/80 tnum mt-1 text-[0.6875rem]">pays up to {usdc(o.max_payout)}</p>
              </div>
            </button>
          ))}
          {rfq.declined.map((d, i) => (
            <div
              key={d.solver}
              style={{ animation: `rise 0.6s var(--ease-out-quint) ${(rfq.offers.length + i) * 90}ms both` }}
              className="border-line/60 rounded-lg border border-dashed p-3"
            >
              <p className="text-mute text-[0.875rem]">
                <span className="text-bone/70">{d.name}</span>{d.ai && <span className="text-blue-lit"> (AI agent)</span>} declined — {d.reason}
              </p>
            </div>
          ))}
          {rfq.offers.length === 0 && (
            <p className="text-blood text-[0.875rem]">
              Nobody will quote while the peg is breaking. That is the market working.
            </p>
          )}
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-[0.875rem] ${msg.tone === "good" ? "text-mint" : "text-blood"}`}>
          {msg.text}{" "}
          {msg.tx && (
            <a
              className="underline underline-offset-2 opacity-70 hover:opacity-100"
              href={`${live.state?.contracts.explorer}/transactions/${msg.tx}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {shortTx(msg.tx)}
            </a>
          )}
        </p>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ the dump
export function DumpPanel({ live, guest }: { live: Live; guest: Guest }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const disabled = !guest.accountId || busy;

  async function dump(amount: number) {
    setBusy(true);
    setErr(null);
    live.markShock();
    try {
      const r = await api.dump(amount);
      if (!r.ok) setErr(r.error ?? "dump failed");
      void guest.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Break the peg" step="02" tone="danger">
      <p className="text-mute text-[0.875rem] leading-relaxed">
        Sell demo stable into the pool. Each press is a real NEAR transaction that moves the price everyone
        else is reading.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[5_000, 25_000, 50_000].map((v) => (
          <button
            key={v}
            onPointerDown={ripple}
            onClick={() => void dump(v)}
            disabled={disabled}
            className="ripple-host border-blood/40 bg-blood/10 hover:bg-blood/20 text-blood tnum rounded-lg border py-3 text-[0.9375rem] font-semibold transition-[background-color,border-color,translate,box-shadow] duration-300 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(255,68,56,0.22)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {(v / 1000).toFixed(0)}k
          </button>
        ))}
      </div>
      <p className="text-mute/60 mt-2.5 text-[0.75rem]">
        About 25k crosses the first tier. Three presses takes it under every line.
      </p>
      {err && <p className="text-blood mt-3 text-[0.875rem]">{err}</p>}
    </Panel>
  );
}

// -------------------------------------------------------------- the policies
const STATUS_TONE: Record<string, string> = {
  Pending: "text-amber border-amber/40 bg-amber/10",
  Active: "text-mint border-mint/40 bg-mint/10",
  Triggered: "text-amber border-amber/50 bg-amber/15",
  PaidOut: "text-amber border-amber/60 bg-amber/20",
  Void: "text-mute border-line bg-ink-3",
  Expired: "text-mute border-line bg-ink-3",
};

export function PolicyList({ policies, mine }: { policies: Policy[]; mine: string | null }) {
  const list = policies.filter((p) => !mine || p.holder === mine).slice(0, 6);
  return (
    <Panel title="Your policies" step="03">
      {list.length === 0 ? (
        <p className="text-mute text-[0.875rem]">No cover yet. Buy some above, then break the peg.</p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((p) => {
            const paid = p.status === "PaidOut" || p.status === "Triggered";
            return (
              <li key={p.id} className="border-line/70 bg-ink/50 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.9375rem] font-medium">#{p.id}</span>
                  <span key={p.status} className={`pill-pop rounded-full border px-2 py-0.5 text-[0.6875rem] ${STATUS_TONE[p.status]}`}>
                    {p.status === "PaidOut" ? "paid out" : p.status.toLowerCase()}
                  </span>
                </div>
                <div className="text-mute mt-2 flex items-baseline justify-between text-[0.8125rem]">
                  <span>Covering {usdc(p.notional, 0)} fUSDC</span>
                  <span className={`tnum ${paid ? "text-amber" : ""}`}>
                    {paid ? `+${usdc(p.payout_amount)}` : `−${usdc(p.premium)}`}
                  </span>
                </div>
                {/* lifecycle rail */}
                <div className="mt-3 flex gap-1">
                  {["Pending", "Active", "Triggered", "PaidOut"].map((s, i) => {
                    const order = ["Pending", "Active", "Triggered", "PaidOut"];
                    const at = order.indexOf(p.status);
                    const done = at >= i && at >= 0;
                    return (
                      <span
                        key={s}
                        className={`h-1 flex-1 rounded-full transition-colors duration-700 ${
                          p.status === "Void" || p.status === "Expired"
                            ? "bg-line"
                            : done
                              ? "bg-mint"
                              : "bg-line"
                        }`}
                      />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ the feed
const TONE: Record<string, string> = {
  good: "text-mint",
  bad: "text-blood",
  gold: "text-amber",
  info: "text-mute",
};

export function Feed({ live }: { live: Live }) {
  return (
    <Panel title="Live from the chain" step="04">
      {live.feed.length === 0 ? (
        <p className="text-mute text-[0.875rem]">Waiting for something to happen…</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {live.feed.map((f) => (
            <li
              key={f.id}
              className="flex gap-2.5 rounded px-1 text-[0.8125rem] leading-snug"
              style={{ animation: "feed-in 0.5s var(--ease-out-quint) both, flash-up 1.2s ease-out both" }}
            >
              <span className="text-mute/50 tnum shrink-0 text-[0.6875rem] leading-5">
                {new Date(f.ts).toLocaleTimeString("en-GB", { hour12: false }).slice(0, 8)}
              </span>
              <span className={TONE[f.tone]}>
                {f.text}
                {f.tx && (
                  <a
                    className="ml-1.5 underline underline-offset-2 opacity-50 hover:opacity-100"
                    href={`${live.state?.contracts.explorer}/transactions/${f.tx}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {shortTx(f.tx)}
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
