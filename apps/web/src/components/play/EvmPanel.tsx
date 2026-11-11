"use client";

import { useCallback, useEffect, useState } from "react";
import { api, usdc, type EvmView } from "@/lib/api";
import type { Live } from "@/lib/useFloor";
import type { Guest } from "@/lib/useGuest";
import { Panel } from "./Panels";

const STATUS_COPY: Record<string, string> = {
  Reserved: "reserved — waiting for gas parameters",
  Signing: "asking the NEAR MPC to sign…",
  Signed: "signed — broadcasting",
  Confirmed: "landed on Ethereum",
};

/**
 * The cross-chain leg: the holder names an address on another chain, and when the policy triggers the NEAR
 * contract signs a real transfer to it through Chain Signatures. No bridge, no wrapped token.
 */
export function EvmPanel({ live, guest }: { live: Live; guest: Guest }) {
  const [view, setView] = useState<EvmView | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.evm());
    } catch {
      /* worker not up yet */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load, live.paidAt]);

  if (!view?.enabled || !view.chain) return null;

  const mine = view.myAddress ? view.payouts.filter((p) => p.to.toLowerCase() === view.myAddress!.toLowerCase()) : [];

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.setPayoutAddress(draft.trim());
      setDraft("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Get paid on Ethereum" step="05">
      <p className="text-mute text-[0.875rem] leading-relaxed">
        Name an address on {view.chain.name.replace("-", " ")} and the NEAR contract will sign a real USDC
        transfer to it when your policy pays. No bridge: the contract controls that address through Chain
        Signatures.
      </p>

      {view.myAddress ? (
        <div className="border-line/70 bg-ink/50 mt-4 rounded-lg border p-3">
          <p className="kicker !text-[0.5625rem]">Paying out to</p>
          <p className="tnum mt-1 break-all text-[0.8125rem]">{view.myAddress}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              disabled={!guest.accountId || busy}
              className="border-line bg-ink/60 focus:border-blue tnum min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-[0.8125rem] outline-none transition-colors disabled:opacity-40"
            />
            <button
              onClick={() => void save()}
              disabled={!guest.accountId || busy || !/^0x[0-9a-fA-F]{40}$/.test(draft.trim())}
              className="bg-blue hover:bg-blue-lit shrink-0 rounded-lg px-4 text-[0.875rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? "…" : "Save"}
            </button>
          </div>
          <p className="text-mute/60 mt-2 text-[0.75rem]">
            Set this before the peg breaks — the address is read when the payout is created.
          </p>
        </>
      )}

      {err && <p className="text-blood mt-3 text-[0.875rem]">{err}</p>}

      {mine.length > 0 && (
        <ul className="mt-4 space-y-2">
          {mine.map((po) => (
            <li key={po.id} className="border-line/70 bg-ink/50 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.875rem]">Policy #{po.policy_id}</span>
                <span className="tnum text-amber text-[0.9375rem]">{usdc(po.amount)} USDC</span>
              </div>
              <p className={`mt-1.5 text-[0.75rem] ${po.status === "Confirmed" ? "text-mint" : "text-mute"}`}>
                {STATUS_COPY[po.status] ?? po.status}
              </p>
              {po.evm_tx && (
                <a
                  href={`${view.explorer}/tx/${po.evm_tx}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-lit mt-1.5 inline-block text-[0.75rem] underline underline-offset-2"
                >
                  View on Etherscan ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {view.poolAddress && (
        <p className="text-mute/50 mt-4 text-[0.6875rem] break-all">
          Contract-controlled sender: {view.poolAddress}
        </p>
      )}
    </Panel>
  );
}
