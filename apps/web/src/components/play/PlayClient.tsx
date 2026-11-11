"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Diorama } from "@/components/Diorama";
import { useFloor, useScene } from "@/lib/useFloor";
import { useGuest } from "@/lib/useGuest";
import { price as fmtPrice, usdc, tierPrice } from "@/lib/api";
import { BuyPanel, DumpPanel, PolicyList, Feed } from "./Panels";
import { EvmPanel } from "./EvmPanel";
import { DirectorOverlay } from "./DirectorOverlay";
import { Odometer } from "@/components/Odometer";
import { useDirector } from "@/lib/useDirector";
import { useSound } from "@/lib/sfx";

export function PlayClient() {
  const guest = useGuest();
  const live = useFloor(guest.accountId);
  const mine = useMemo(
    () => live.policies.filter((p) => !guest.accountId || p.holder === guest.accountId),
    [live.policies, guest.accountId],
  );
  const baseScene = useScene(live, mine.length ? mine : undefined);

  // every dump drops a block into the reservoir; remember the recent ones so each gets its own splash
  const [impacts, setImpacts] = useState<number[]>([]);
  useEffect(() => {
    if (!live.shockAt) return;
    setImpacts((xs) => [...xs.filter((t) => Date.now() - t < 3000), live.shockAt as number]);
  }, [live.shockAt]);
  const scene = useMemo(() => ({ ...baseScene, impacts }), [baseScene, impacts]);

  const sfx = useSound();
  const director = useDirector({ guest, live, play: sfx.play });
  const showDirector = director.view.running || director.view.done || !!director.view.error;
  const [dismissed, setDismissed] = useState(false);
  const overlayOn = showDirector && !dismissed;

  const p = live.price ? live.price.price_e8 / 1e8 : 1;
  const gate = live.gate;
  const params = live.state?.params;
  const broken = params ? p < params.band_e8 / 1e8 : false;

  // After a breach the contract keeps selling shut for a lookback window even once the peg is back.
  // Showing the countdown stops that reading as a bug.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const reopenIn =
    !gate?.open && !broken && gate?.last_out_of_band_ts && params
      ? Math.max(0, gate.last_out_of_band_ts + params.lookback_secs - now)
      : 0;

  // The gate flag trails the price by a few seconds (it is only refreshed when the keeper pokes), so call a
  // broken peg what it is straight away instead of showing "on sale" next to a crashing price.
  const sellable = !!gate?.open && !broken;
  const gateLabel = gate?.open && broken
    ? "Peg under stress — gate closing"
    : gate?.open
    ? "Cover on sale"
    : gate?.reason === "STALE_PRICE"
      ? "Waiting for a price…"
      : broken
        ? "Gate closed — peg under stress"
        : reopenIn > 0
          ? `Gate closed — reopens in ${reopenIn}s`
          : "Gate closed";

  // flash the whole screen red on a dump, gold on a payout
  const [flash, setFlash] = useState<"none" | "red" | "gold">("none");
  useEffect(() => {
    if (!live.shockAt) return;
    setFlash("red");
    const t = setTimeout(() => setFlash("none"), 700);
    return () => clearTimeout(t);
  }, [live.shockAt]);
  useEffect(() => {
    if (!live.paidAt) return;
    setFlash("gold");
    const t = setTimeout(() => setFlash("none"), 1800);
    return () => clearTimeout(t);
  }, [live.paidAt]);

  // cues follow the live stream, so the same sounds play whether you drive it or the director does
  useEffect(() => {
    if (live.shockAt) sfx.play("dump");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.shockAt]);
  useEffect(() => {
    if (live.paidAt) sfx.play("paid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.paidAt]);
  const wasOpen = useRef<boolean | null>(null);
  useEffect(() => {
    const open = gate?.open;
    if (open === undefined) return;
    if (wasOpen.current === true && open === false) sfx.play("gate");
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate?.open]);

  const paidTotal = (guest.accountId ? mine : [])
    .filter((x) => x.status === "PaidOut" || x.status === "Triggered")
    .reduce((a, x) => a + Number(x.payout_amount), 0);

  return (
    <div className="flex min-h-[100svh] flex-col">
      {/* screen-wide flash, purely atmospheric */}
      <div
        className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-500"
        style={{
          opacity: flash === "none" ? 0 : 1,
          background:
            flash === "red"
              ? "radial-gradient(ellipse at center, rgba(255,68,56,0) 40%, rgba(255,68,56,0.22) 100%)"
              : "radial-gradient(ellipse at center, rgba(255,207,110,0.14) 0%, rgba(255,207,110,0) 70%)",
        }}
      />

      {/* -------------------------------------------------------------- top bar */}
      <header className="border-line/70 bg-ink/90 sticky top-0 z-30 border-b backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="transition-opacity hover:opacity-70">
            <Logo />
          </Link>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => {
                setDismissed(false);
                void director.start();
              }}
              disabled={director.view.running}
              className="group bg-blue hover:bg-blue-lit relative overflow-hidden rounded-full px-4 py-1.5 text-[0.8125rem] font-medium text-white transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                  <path d="M2 1l7 4-7 4z" />
                </svg>
                {director.view.running ? "Running…" : "Watch it happen"}
              </span>
              <span
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                aria-hidden="true"
              />
            </button>
            {guest.accountId ? (
              <>
                <div className="hidden items-baseline gap-2 sm:flex">
                  <span className="kicker !text-[0.5625rem]">You</span>
                  <span className="tnum max-w-[13rem] truncate text-[0.8125rem]">{guest.accountId}</span>
                </div>
                <div className="border-line/80 bg-ink-2/70 flex items-baseline gap-2 rounded-full border px-3 py-1.5">
                  <span className="tnum text-[0.875rem]">{usdc(guest.balances?.fusdc ?? 0, 2)}</span>
                  <span className="text-mute text-[0.6875rem]">fUSDC</span>
                </div>
                <button
                  onClick={() => void guest.topUp()}
                  disabled={guest.loading}
                  className="border-line hover:border-mute/60 text-mute hover:text-bone rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors disabled:opacity-40"
                >
                  Top up
                </button>
              </>
            ) : (
              <span className="text-mute text-[0.8125rem]">Not connected</span>
            )}
            <span
              className={`h-1.5 w-1.5 rounded-full ${live.connected ? "bg-mint" : "bg-mute"}`}
              title={live.connected ? "streaming from the chain" : "reconnecting"}
            />
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- body */}
      <div className="grid flex-1 lg:grid-cols-[1fr_26rem]">
        {/* the world */}
        <div className="relative min-h-[58svh] lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)] lg:min-h-0 lg:self-start">
          <Diorama
            scene={scene}
            className="absolute inset-0 h-full w-full"
            scale={0.96}
            yOffset={0.01}
            camera={overlayOn ? director.view.camera : undefined}
            parallax
          />
          <DirectorOverlay
            view={overlayOn ? director.view : { ...director.view, running: false, done: false, error: null }}
            onStop={director.stop}
            onRestart={() => {
              setDismissed(false);
              void director.start();
            }}
            onClose={() => setDismissed(true)}
            soundOn={sfx.on}
            onToggleSound={sfx.toggle}
          />

          {/* peg readout */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 transition-[padding] duration-700 md:p-6 ${
              overlayOn ? "pt-14 md:pt-16" : ""
            }`}
          >
            <div>
              <p className="kicker">Peg</p>
              <p
                className={`tnum mt-1 text-[clamp(2rem,5vw,3.25rem)] leading-none transition-colors duration-500 ${
                  broken ? "text-blood" : "text-bone"
                }`}
              >
                $<Odometer value={fmtPrice(live.price?.price_e8 ?? 1e8)} />
              </p>
              <p
                className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.75rem] ${
                  sellable ? "border-mint/40 bg-mint/10 text-mint" : "border-blood/40 bg-blood/10 text-blood"
                }`}
              >
                {gateLabel}
              </p>
            </div>

            {paidTotal > 0 && (
              <div className="border-amber/50 bg-amber/10 rounded-xl border px-4 py-3 text-right backdrop-blur-md">
                <p className="kicker !text-amber/70">Paid to you</p>
                <p className="tnum text-amber mt-1 text-[1.5rem] leading-none">+{usdc(paidTotal)}</p>
              </div>
            )}
          </div>

          {/* tier ladder */}
          {params && (
            <div className="pointer-events-none absolute bottom-0 left-0 p-4 md:p-6">
              <p className="kicker mb-2">Payout tiers</p>
              <ul className="space-y-1.5">
                {params.tiers.map((t, i) => {
                  const lvl = tierPrice(t.below_price_e8);
                  const under = p < lvl;
                  const sustained = gate?.tiers?.[i]?.sustained;
                  return (
                    <li key={i} className="flex items-center gap-2.5 text-[0.8125rem]">
                      <span
                        className={`h-2 w-2 rounded-full transition-colors duration-500 ${
                          sustained ? "bg-blood" : under ? "bg-amber" : "bg-line"
                        }`}
                        style={sustained ? { animation: "pulse-ring 1.6s infinite" } : undefined}
                      />
                      <span className={`tnum ${under ? "text-bone" : "text-mute"}`}>${lvl.toFixed(2)}</span>
                      <span className="text-mute">pays {(t.payout_bps / 100).toFixed(0)}%</span>
                      {sustained && <span className="text-blood text-[0.6875rem]">HELD — SETTLING</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* the controls */}
        <aside
          className={`border-line/70 bg-ink-2/30 space-y-3 border-t p-4 transition-opacity duration-500 lg:overflow-y-auto lg:border-t-0 lg:border-l ${
            director.view.running ? "pointer-events-none opacity-40" : ""
          }`}
        >
          {!guest.accountId ? (
            <div className="border-line/80 bg-ink-2/70 rounded-xl border p-6">
              <h2 className="display-md">Step inside.</h2>
              <p className="text-mute mt-3 text-[0.9375rem] leading-relaxed">
                We&apos;ll make you a real NEAR testnet account and fund it with demo credits. No wallet, no seed
                phrase, no gas.
              </p>
              <button
                onClick={() => void guest.start()}
                disabled={guest.loading}
                className="bg-blue hover:bg-blue-lit mt-5 w-full rounded-lg py-3.5 text-[1rem] font-medium text-white transition-colors disabled:opacity-50"
              >
                {guest.loading ? "Creating your account…" : "Give me an account"}
              </button>
              <button
                onClick={() => {
                  setDismissed(false);
                  void director.start();
                }}
                className="border-line hover:border-blue/70 hover:bg-blue/10 mt-2.5 w-full rounded-lg border py-3.5 text-[1rem] font-medium transition-colors"
              >
                Or just watch it happen
              </button>
              {guest.error && <p className="text-blood mt-3 text-[0.875rem]">{guest.error}</p>}
              <p className="text-mute/60 mt-4 text-[0.75rem]">
                Custodial and testnet-only: the server holds this key. Never use it for anything real.
              </p>
            </div>
          ) : (
            <>
              <BuyPanel live={live} guest={guest} />
              <DumpPanel live={live} guest={guest} />
              <PolicyList policies={mine} mine={guest.accountId} />
              <EvmPanel live={live} guest={guest} />
              <Feed live={live} />
            </>
          )}

          {live.error && (
            <p className="text-blood border-blood/30 bg-blood/5 rounded-lg border p-3 text-[0.8125rem]">
              Cannot reach the worker: {live.error}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
