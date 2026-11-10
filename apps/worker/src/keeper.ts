// Keeper: keeps the on-chain price fresh and drives every policy through its lifecycle:
// activate when the wait is over, trigger when a tier was sustained, expire when the tenor ends,
// and retry any refund or payout that is still owed. Anyone could do this; the keeper just does it on time.
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";
import type { Bus } from "./events.js";
import { BAND_E8 } from "./arb.js";
import type { PriceFeed } from "./prices.js";

export interface PolicyView {
  id: number;
  holder: string;
  solver: string;
  notional: string;
  premium: string;
  max_payout: string;
  created_ts: number;
  activate_ts: number;
  expires_ts: number;
  status: "Pending" | "Active" | "Void" | "Triggered" | "PaidOut" | "Expired";
  tier_idx: number | null;
  payout_amount: string;
  owed: string;
  paying: boolean;
}

export type Action = { kind: "activate" | "trigger" | "expire" | "pay"; id: number };

/** Deepest tier sustained inside [from, to], or null. Mirrors Floor::deepest_tier_in_window. */
export function deepestTier(log: Array<[number, number]>, from: number, to: number): number | null {
  let best: number | null = null;
  for (const [ts, tier] of log) if (ts >= from && ts <= to && (best === null || tier > best)) best = tier;
  return best;
}

/** Time the first tier was sustained inside [from, to], or null. The contract waits `settle_secs` after this. */
export function firstSustained(log: Array<[number, number]>, from: number, to: number): number | null {
  let first: number | null = null;
  for (const [ts] of log) if (ts >= from && ts <= to && (first === null || ts < first)) first = ts;
  return first;
}

/**
 * What the keeper should do for each policy right now. Pure, so it is unit-tested.
 * `settleSecs` mirrors the contract: a policy can only be triggered that long after its first sustained tier,
 * so deeper tiers still sustaining are counted. Triggering earlier would just fail on-chain.
 */
export function planActions(policies: PolicyView[], log: Array<[number, number]>, now: number, settleSecs = 0): Action[] {
  const out: Action[] = [];
  for (const p of policies) {
    if (p.status === "Pending" && now >= p.activate_ts) out.push({ kind: "activate", id: p.id });
    else if (p.status === "Active") {
      const first = firstSustained(log, p.activate_ts, p.expires_ts);
      if (first !== null) {
        if (now >= first + settleSecs) out.push({ kind: "trigger", id: p.id });
      } else if (now > p.expires_ts) out.push({ kind: "expire", id: p.id });
    } else if ((p.status === "Triggered" || p.status === "Void") && p.owed !== "0" && !p.paying) {
      out.push({ kind: "pay", id: p.id });
    }
  }
  return out;
}

export function startKeeper(chain: Chain, cfg: Cfg, feed: PriceFeed, bus: Bus) {
  const acct = chain.account(cfg.keeper.id, cfg.keeper.key);
  const lastStatus = new Map<number, string>();
  let lastPoke = 0;
  let pokeInFlight: Promise<void> | null = null;
  let demandUntil = 0;
  let lastFetch = 0;
  let busy = false;
  let settleSecs: number | undefined;

  function pokeNow(): Promise<void> {
    if (pokeInFlight) return pokeInFlight;
    pokeInFlight = (async () => {
      const r = await chain.send(acct, cfg.floor, "poke", {}, { tgas: 100 });
      lastPoke = Date.now();
      if (!r.ok) bus.emit("keeper", { action: "poke", ok: false, error: r.error });
    })().finally(() => {
      pokeInFlight = null;
    });
    return pokeInFlight;
  }

  /** Called by the API before quoting or buying so the gate sees a fresh price. */
  async function ensureFresh(maxAgeMs = 8000): Promise<void> {
    demandUntil = Date.now() + 60_000;
    if (Date.now() - lastPoke > maxAgeMs) await pokeNow();
  }

  async function perform(a: Action) {
    const r = await chain.send(acct, cfg.floor, a.kind, { policy_id: a.id }, { tgas: 120 });
    bus.emit("keeper", { action: a.kind, id: a.id, ok: r.ok, tx: r.hash, error: r.error, events: r.events.map((e) => e.event) });
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const stats = await chain.view<any>(cfg.floor, "get_pool_stats");
      const count = Number(stats?.policies ?? 0);
      const price = feed.latest?.price_e8 ?? 100_000_000;
      const stressed = price < BAND_E8 + 300_000;
      const hot = stressed || Date.now() < demandUntil;

      const policies =
        count > 0
          ? ((await chain.view<PolicyView[]>(cfg.floor, "list_policies", { from_index: Math.max(0, count - 40), limit: 40 })) ?? [])
          : [];
      lastFetch = Date.now();
      const open = policies.some((p) => ["Pending", "Active"].includes(p.status) || (p.owed !== "0" && !p.paying));

      for (const p of policies) {
        const prev = lastStatus.get(p.id);
        if (prev !== p.status) {
          lastStatus.set(p.id, p.status);
          bus.emit("policy", { id: p.id, status: p.status, from: prev ?? null, holder: p.holder, tier_idx: p.tier_idx, payout_amount: p.payout_amount });
        }
      }

      // Poke often when something needs a fresh price, rarely otherwise (each poke costs gas and an RPC call).
      const interval = open || hot ? 5000 : 25000;
      if (Date.now() - lastPoke >= interval) await pokeNow();

      // Nothing below matters unless a policy is in flight, and these are the most expensive reads.
      if (!open) return;
      const log = ((await chain.view<Array<[number, number]>>(cfg.floor, "get_sustained_log")) ?? []) as Array<[number, number]>;
      settleSecs ??= Number((await chain.view<any>(cfg.floor, "get_params"))?.settle_secs ?? 0);
      for (const a of planActions(policies, log, now, settleSecs)) await perform(a);
    } catch (e) {
      bus.emit("keeper", { action: "tick", ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) });
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void tick(), 5000);
  void tick();
  return {
    stop: () => clearInterval(timer),
    ensureFresh,
    pokeNow,
    lastFetch: () => lastFetch,
  };
}
