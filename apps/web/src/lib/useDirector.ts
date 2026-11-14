"use client";

import { useCallback, useRef, useState } from "react";
import { api, type Offer, type Policy } from "./api";
import type { Camera } from "@/components/Diorama";
import type { Cue } from "./sfx";
import type { Guest } from "./useGuest";
import type { Live } from "./useFloor";

/**
 * "Watch it happen": runs the whole story for the viewer, for real.
 *
 * Nothing here is faked or replayed. Every step calls the same API as the manual controls, so each beat is a
 * real NEAR transaction and the waits are the contract's own windows. The director's job is only to ask the
 * right questions in the right order, aim the camera, and say what is going on while the chain works.
 */

export interface Chapter {
  n: number;
  title: string;
  line: string;
  sub?: string;
}

export interface Countdown {
  label: string;
  /** Epoch ms when it ends, and the total length in ms (for the ring). */
  until: number;
  total: number;
  /** True when the end is an estimate ("about 40s"), false when it is a hard chain timestamp. */
  approx: boolean;
}

export interface DirectorView {
  running: boolean;
  done: boolean;
  error: string | null;
  chapter: Chapter | null;
  total: number;
  quotes: Array<{ name: string; premium: string; best: boolean }> | null;
  refused: string | null;
  countdown: Countdown | null;
  dumps: number;
  tx: Array<{ label: string; url: string }>;
  result: { premium: number; payout: number; seconds: number; evmUrl: string | null; evmSkipped: string | null } | null;
  camera: Camera;
  /** Dim the world slightly while a caption needs the eye. */
  focus: boolean;
  /** True while the story is only dwelling on a caption, so "Next" can move on. False while waiting on the chain. */
  canAdvance: boolean;
  /** Step-by-step mode: every dwell waits for the viewer instead of a timer. */
  manual: boolean;
}

// camera presets: wide shot, the reservoir, the plaza where policies live, the towers
const WIDE: Camera = { scale: 0.96, x: 0, y: 0.01 };
const SHOTS = {
  wide: WIDE,
  towers: { scale: 1.12, x: 0, y: 0.05 },
  pit: { scale: 1.3, x: 0, y: 0.03 },
  plaza: { scale: 1.34, x: 0, y: 0.17 },
  finale: { scale: 0.9, x: 0, y: 0.0 },
} as const;

const DEMO_RECIPIENT = "0x525521d79134822a342d330bd91da67976569af1";
const EMPTY: DirectorView = {
  running: false,
  done: false,
  error: null,
  chapter: null,
  total: 0,
  quotes: null,
  refused: null,
  countdown: null,
  dumps: 0,
  tx: [],
  result: null,
  camera: WIDE,
  focus: false,
  canAdvance: false,
  manual: false,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usd = (base: string | number) => Number(base) / 1e6;

class Cancelled extends Error {}

export function useDirector(deps: { guest: Guest; live: Live; play: (c: Cue) => void }) {
  const [view, setView] = useState<DirectorView>(EMPTY);
  const runId = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  /** Releases the dwell the story is currently resting on. Null while it is waiting on the chain. */
  const advanceRef = useRef<(() => void) | null>(null);
  /** Cancels the auto timer of the current dwell, so switching to step-by-step holds the slide you are on. */
  const holdRef = useRef<(() => void) | null>(null);
  const manualRef = useRef(false);

  const patch = useCallback((p: Partial<DirectorView>) => setView((v) => ({ ...v, ...p })), []);

  const stop = useCallback(() => {
    runId.current++;
    advanceRef.current?.();
    setView((v) => ({ ...v, running: false, countdown: null, camera: WIDE, focus: false, canAdvance: false }));
  }, []);

  /** "Next": move past the caption the story is resting on. Chain-bound waits cannot be skipped. */
  const advance = useCallback(() => advanceRef.current?.(), []);

  const setManual = useCallback((on: boolean) => {
    manualRef.current = on;
    setView((v) => ({ ...v, manual: on }));
    if (on) holdRef.current?.(); // entering step-by-step freezes the slide that is counting down
    else advanceRef.current?.(); // leaving it releases whatever is waiting
  }, []);

  const start = useCallback(async () => {
    const id = ++runId.current;
    const alive = () => runId.current === id;
    const t0 = Date.now();
    const { play } = depsRef.current;

    /**
     * Poll until `fn` returns something truthy, or throw. Bails out silently if the viewer stops the run.
     * Pressing Next during a chain-bound wait cuts the sleep and asks the chain again right now, so the
     * story moves the instant the chain allows instead of on the next poll tick.
     */
    async function until<T>(
      label: string,
      fn: () => Promise<T | null | undefined | false>,
      ms: number,
      every = 2500,
    ): Promise<T> {
      const end = Date.now() + ms;
      try {
        for (;;) {
          if (!alive()) throw new Cancelled();
          const v = await fn();
          if (v) return v as T;
          if (Date.now() > end) throw new Error(`Timed out waiting for ${label}. The chain may be busy; try again.`);
          await new Promise<void>((r) => {
            const t = setTimeout(r, every);
            advanceRef.current = () => {
              clearTimeout(t);
              r();
            };
          });
        }
      } finally {
        advanceRef.current = null;
      }
    }

    const chapter = (n: number, title: string, line: string, sub?: string, extra: Partial<DirectorView> = {}) => {
      if (alive()) patch({ chapter: { n, title, line, sub }, focus: true, ...extra });
    };

    /**
     * Rest on the current caption. Auto mode: for `ms`. Step-by-step mode: until the viewer presses Next.
     * `min` is a floor that Next cannot skip (the pool allows one dump every 1.5s).
     */
    async function dwell(ms: number, min = 0): Promise<void> {
      if (!alive()) throw new Cancelled();
      const started = Date.now();
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const release = () => {
          const left = min - (Date.now() - started);
          if (left > 0) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(finish, left);
          } else finish();
        };
        const hold = () => {
          if (timer) clearTimeout(timer);
          timer = undefined;
        };
        function finish() {
          if (timer) clearTimeout(timer);
          // only clear the handlers if they are still ours: a newer run may have installed its own
          if (advanceRef.current === release) advanceRef.current = null;
          if (holdRef.current === hold) holdRef.current = null;
          resolve();
        }
        advanceRef.current = release;
        holdRef.current = hold;
        if (!manualRef.current) timer = setTimeout(finish, ms);
        patch({ canAdvance: true });
      });
      patch({ canAdvance: false });
      if (!alive()) throw new Cancelled();
    }

    setView({ ...EMPTY, running: true, manual: manualRef.current });

    try {
      // Decide the length of the story up front, so the progress rail never changes under the viewer.
      let evm = await api.evm().catch(() => null);
      const sender = evm?.funding;
      const evmReady =
        !!evm?.enabled &&
        !!sender &&
        BigInt(sender.usdc) >= 5_000_000n &&
        BigInt(sender.eth) >= 2_000_000_000_000_000n;
      // Only claim the sender is short when we actually read its balance; an older worker reports nothing.
      const evmSkipped = evm?.enabled && sender && !evmReady ? "The Ethereum sender is low on test funds, so this run stays on NEAR." : null;
      const total = evmReady ? 9 : 8;
      patch({ total });

      // ------------------------------------------------------------ 1. the account
      chapter(1, "Step inside", "You get a real NEAR account in seconds.", "No wallet. No seed phrase. No gas. We cover it.", {
        camera: SHOTS.wide,
      });
      let who = depsRef.current.guest.accountId;
      if (!who) who = await depsRef.current.guest.start();
      if (!who) throw new Error("Could not create a testnet account. Is the worker running?");
      await dwell(1600);

      // The market must be open to start. If the last crash is still cooling off, say so rather than stall.
      const open = await api.state();
      if (open.gate && !open.gate.open) {
        const lookback = open.params.lookback_secs;
        const reopen = open.gate.last_out_of_band_ts
          ? (open.gate.last_out_of_band_ts + lookback) * 1000
          : Date.now() + 20_000;
        chapter(1, "Cooling off", "The last crash is still settling.", "Cover stays closed for a while after a depeg. That is the rule working.", {
          countdown: { label: "market reopens", until: reopen, total: lookback * 1000, approx: true },
        });
        await until("the market to reopen", async () => (await api.state()).gate?.open, 300_000, 3000);
        patch({ countdown: null });
      }

      // ------------------------------------------------------------ 2. the quotes
      chapter(2, "Ask for cover", "Three solvers bid for your business.", "Each one is a bot with its own NEAR account and its own money at stake.", {
        camera: SHOTS.towers,
        quotes: null,
        countdown: null,
      });
      const rfq = await api.rfq(100, 300);
      if (!alive()) throw new Cancelled();
      if (rfq.offers.length === 0) throw new Error("No solver would quote right now. Try again in a minute.");
      patch({
        quotes: rfq.offers.map((o: Offer) => ({
          name: o.name,
          premium: usd(o.premium).toFixed(2),
          best: o.solver === rfq.best,
        })),
      });
      play("buy");
      await dwell(3200);

      // ------------------------------------------------------------ 3. the purchase
      chapter(3, "Lock it in", "The cheapest quote wins.", "Your premium and that solver's margin lock together in one contract call.", {
        camera: SHOTS.plaza,
      });
      const buy = await api.buy(rfq.rfq_id, rfq.best!);
      if (!buy.ok || !buy.policy_id) {
        throw new Error(buy.rejected ? `The contract refused the purchase: ${buy.rejected}` : (buy.error ?? "Purchase failed."));
      }
      const pid = buy.policy_id;
      const best = rfq.offers.find((o: Offer) => o.solver === rfq.best)!;
      patch({ tx: [{ label: "Policy bought", url: buy.tx_url }] });
      play("buy");

      // ------------------------------------------------------------ 4. activation
      const pol0 = await until<Policy>(
        "the policy",
        async () => (await api.policies(who!)).policies.find((p) => p.id === pid),
        60_000,
        1500,
      );
      chapter(4, "A short wait", "Cover starts after a brief delay.", "So nobody can buy while the ground is already moving.", {
        countdown: {
          label: "cover activates",
          until: pol0.activate_ts * 1000,
          total: Math.max(1000, (pol0.activate_ts - pol0.created_ts) * 1000),
          approx: false,
        },
      });
      await until(
        "activation",
        async () => (await api.policies(who!)).policies.find((p) => p.id === pid && p.status === "Active"),
        120_000,
        2000,
      );
      patch({ countdown: null });

      // A latecomer's quote, fetched while the peg still holds, so we can show it being refused later.
      const late = await api.rfq(100, 300).catch(() => null);

      // The destination for the cross-chain payout has to be on file before the trigger.
      if (evmReady) {
        evm = await api.evm().catch(() => evm);
        if (!evm?.myAddress) await api.setPayoutAddress(DEMO_RECIPIENT).catch(() => null);
      }

      // ------------------------------------------------------------ 5. the break
      chapter(5, "Now break it", "Somebody dumps the stablecoin.", "Each hit is a real transaction that moves the price everyone reads.", {
        camera: SHOTS.pit,
        quotes: null,
      });
      await dwell(1800);
      for (let i = 1; i <= 3; i++) {
        if (!alive()) throw new Cancelled();
        depsRef.current.live.markShock();
        const d = await api.dump(25000);
        if (!d.ok) throw new Error(d.error ?? "A dump failed.");
        patch({ dumps: i });
        chapter(5, "Now break it", `Peg falls to $${(d.price_e8 / 1e8).toFixed(4)}.`, i < 3 ? "Hit it again." : "Below every payout line.");
        await dwell(i < 3 ? 2300 : 1600, 1600);
      }
      const dumpedAt = Date.now();

      // ------------------------------------------------------------ 6. the refusal
      chapter(6, "Too late", "A latecomer tries to buy cover.", "The contract looks at the price, sees stress, and says no.", {
        camera: SHOTS.towers,
      });
      await until("the gate to close", async () => (await api.state()).gate?.open === false, 60_000, 2000);
      if (late && late.offers.length > 0 && late.best) {
        const r = await api.buy(late.rfq_id, late.best).catch(() => null);
        patch({ refused: r?.rejected ?? "GATE_CLOSED" });
        if (r?.tx_url) {
          patch({ tx: [{ label: "Policy bought", url: buy.tx_url }, { label: "Late buyer refused", url: r.tx_url }] });
        }
      } else {
        patch({ refused: "GATE_CLOSED" });
      }
      await dwell(4200);

      // ------------------------------------------------------------ 7. the hold
      const st = await api.state();
      const hold = (st.params.sustain_secs + st.params.settle_secs) * 1000;
      chapter(
        7,
        "Hold the line",
        "Stay under a line long enough and it counts.",
        "A flash that recovers pays nothing. The contract waits, then settles on the deepest tier reached.",
        {
          camera: SHOTS.pit,
          refused: null,
          countdown: { label: "contract settles", until: dumpedAt + hold + 6000, total: hold + 6000, approx: true },
        },
      );
      const paid = await until<Policy>(
        "the payout",
        async () => {
          const p = (await api.policies(who!)).policies.find((x) => x.id === pid);
          return p && (p.status === "PaidOut" || p.status === "Triggered") ? p : null;
        },
        300_000,
        2500,
      );
      depsRef.current.live.markShock();

      // ------------------------------------------------------------ 8. the payout
      const payout = usd(paid.payout_amount);
      const premium = usd(best.premium);
      chapter(
        8,
        "The contract pays",
        `+${payout.toFixed(2)} fUSDC, automatically.`,
        `You paid ${premium.toFixed(2)}. No claim form. No committee. Nobody to ask.`,
        {
          camera: SHOTS.plaza,
          countdown: null,
          result: { premium, payout, seconds: Math.round((Date.now() - t0) / 1000), evmUrl: null, evmSkipped },
        },
      );
      await dwell(5200);

      // ------------------------------------------------------------ 9. the other chain
      if (evmReady) {
        chapter(
          9,
          "Across chains",
          "Now the same payout, on Ethereum.",
          "The contract builds an Ethereum transaction itself and asks the NEAR network to sign it. No bridge.",
          { camera: SHOTS.finale },
        );
        const done = await until<{ evm_tx: string }>(
          "the Ethereum payout",
          async () => {
            const e = await api.evm();
            const po = e.payouts.find((x) => x.policy_id === pid && x.status === "Confirmed" && x.evm_tx);
            return po ? { evm_tx: po.evm_tx! } : null;
          },
          240_000,
          3000,
        );
        const evmUrl = `${evm?.explorer ?? "https://sepolia.etherscan.io"}/tx/${done.evm_tx}`;
        play("paid");
        patch({
          result: { premium, payout, seconds: Math.round((Date.now() - t0) / 1000), evmUrl, evmSkipped: null },
          tx: [
            { label: "Policy bought", url: buy.tx_url },
            { label: "USDC landed on Ethereum", url: evmUrl },
          ],
        });
        chapter(9, "Across chains", "5 USDC landed on Ethereum.", "That address is controlled by the NEAR contract. Open the transaction and see for yourself.");
        await dwell(6500);
      }

      if (!alive()) throw new Cancelled();
      patch({ running: false, done: true, focus: false, camera: SHOTS.finale, countdown: null, canAdvance: false });
    } catch (e) {
      if (e instanceof Cancelled) return;
      patch({ running: false, error: (e as Error).message, focus: false, countdown: null, camera: WIDE, canAdvance: false });
    }
  }, [patch]);

  return { view, start, stop, advance, setManual };
}
