"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE, ApiError, type FloorState, type Gate, type Policy, type PricePoint } from "./api";
import type { SceneState, Tier } from "./diorama";

export interface FeedItem {
  id: number;
  ts: number;
  kind: string;
  text: string;
  tone: "info" | "good" | "bad" | "gold";
  tx?: string;
}

/**
 * loading: first few seconds. waking: no answer yet, so the (free-tier) worker is probably asleep.
 * live: a fresh state has arrived this session. offline: still nothing after two minutes.
 */
export type LiveStatus = "loading" | "waking" | "live" | "offline";

export interface Live {
  status: LiveStatus;
  /** True while what is on screen is the last-known snapshot from an earlier visit, not live data. */
  stale: boolean;
  /** When that snapshot was taken (ms), if there is one. */
  asOf: number | null;
  state: FloorState | null;
  price: PricePoint | null;
  gate: Gate | null;
  history: Array<[number, number]>;
  policies: Policy[];
  feed: FeedItem[];
  connected: boolean;
  error: string | null;
  paidAt: number | null;
  shockAt: number | null;
  refresh: () => void;
  markShock: () => void;
}

const MAX_FEED = 60;
const MAX_HISTORY = 900;
const SNAPSHOT_KEY = "floor.snapshot.v1";
const SNAPSHOT_MAX_AGE_MS = 24 * 3600_000;
const OFFLINE_AFTER_MS = 120_000;
const RETRY_MS = [2000, 3000, 5000, 8000, 10_000];
const REFRESH_MS = 20_000;

interface Snapshot {
  at: number;
  state: FloorState;
}

/** One live connection to the worker: a state snapshot plus an SSE stream of everything that happens. */
export function useFloor(holder?: string | null): Live {
  const [state, setState] = useState<FloorState | null>(null);
  const [price, setPrice] = useState<PricePoint | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [history, setHistory] = useState<Array<[number, number]>>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState<number | null>(null);
  const [shockAt, setShockAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const startedAt = useRef(Date.now());
  const attempts = useRef(0);
  const seq = useRef(0);

  const push = useCallback((kind: string, text: string, tone: FeedItem["tone"], tx?: string) => {
    setFeed((f) => [{ id: ++seq.current, ts: Date.now(), kind, text, tone, tx }, ...f].slice(0, MAX_FEED));
  }, []);

  const loadPolicies = useCallback(async () => {
    try {
      const r = await api.policies(holder ?? undefined);
      setPolicies(r.policies);
    } catch {
      /* transient */
    }
  }, [holder]);

  const fetchState = useCallback(async () => {
    await api
      .state()
      .then((s) => {
        attempts.current = 0;
        setState(s);
        if (s.price) setPrice(s.price);
        if (s.gate) setGate(s.gate);
        if (s.history?.length) setHistory(s.history);
        setLoaded(true);
        setAsOf(null);
        setError(null);
        try {
          localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), state: s } satisfies Snapshot));
        } catch {
          /* storage full or blocked: the snapshot is a nicety */
        }
      })
      .catch((e: Error) => {
        attempts.current += 1;
        setError(e instanceof ApiError ? e.message : "Cannot reach the demo server.");
      });
    void loadPolicies();
  }, [loadPolicies]);

  const refresh = useCallback(() => {
    void fetchState();
  }, [fetchState]);

  // Paint the last-known numbers straight away (clearly marked as old) so a cold or sleeping worker never leaves
  // the page full of zeros. Done after mount, so server and client render the same first frame.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as Snapshot;
      if (!snap?.state || Date.now() - snap.at > SNAPSHOT_MAX_AGE_MS) return;
      setState((cur) => cur ?? snap.state);
      setPrice((cur) => cur ?? snap.state.price);
      setGate((cur) => cur ?? snap.state.gate);
      setHistory((cur) => (cur.length ? cur : (snap.state.history ?? [])));
      setAsOf(snap.at);
    } catch {
      /* corrupt snapshot: ignore */
    }
  }, []);

  // First load, retried with backoff until the worker answers; afterwards a gentle refresh so the stat strip and
  // solver book do not freeze at whatever they showed on arrival.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      if (document.hidden && loaded) {
        timer = setTimeout(loop, REFRESH_MS);
        return;
      }
      // wait for the request to finish (or time out) before scheduling the next, so a sleeping server is never
      // hit by a pile of overlapping retries
      await fetchState();
      if (cancelled) return;
      const wait = loaded ? REFRESH_MS : RETRY_MS[Math.min(Math.max(attempts.current - 1, 0), RETRY_MS.length - 1)]!;
      timer = setTimeout(loop, wait);
    };
    // when already loaded, wait one interval before the next refresh instead of refetching immediately
    if (loaded) timer = setTimeout(loop, REFRESH_MS);
    else void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchState, loaded]);

  // re-evaluate "loading" vs "waking" vs "offline" once a second, only while there is nothing live to show
  useEffect(() => {
    if (loaded) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [loaded]);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      let msg: { kind: string; data: Record<string, unknown> };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const d = msg.data ?? {};

      if (msg.kind === "snapshot") {
        const p = d.price as PricePoint | null;
        if (p) setPrice(p);
        if (d.gate) setGate(d.gate as Gate);
        return;
      }

      if (msg.kind === "price") {
        const p = d as unknown as PricePoint & { gate?: Gate | null };
        setPrice({ t: p.t, price_e8: p.price_e8, reserve_dusd: p.reserve_dusd, reserve_usd: p.reserve_usd, swaps: p.swaps });
        if (p.gate) setGate(p.gate);
        setHistory((h) => {
          const next = h.length && h[h.length - 1]![0] === p.t ? h : [...h, [p.t, p.price_e8] as [number, number]];
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        });
        return;
      }

      switch (msg.kind) {
        case "dump": {
          setShockAt(Date.now());
          const before = Number(d.price_before ?? 0) / 1e8;
          const after = Number(d.price_after ?? 0) / 1e8;
          push("dump", `Dumped ${Number(d.amount ?? 0) / 1e6} dUSD — peg ${before.toFixed(4)} → ${after.toFixed(4)}`, "bad", d.tx as string);
          break;
        }
        case "buy": {
          if (d.ok) push("buy", `Cover bought — policy #${d.policy_id}`, "good", d.tx as string);
          else push("buy", `Purchase refused on-chain: ${d.rejected ?? "failed"} (premium refunded)`, "bad", d.tx as string);
          void loadPolicies();
          break;
        }
        case "policy": {
          const st = String(d.status);
          if (st === "PaidOut") {
            setPaidAt(Date.now());
            push("policy", `Policy #${d.id} paid out ${Number(d.payout_amount ?? 0) / 1e6} fUSDC`, "gold");
          } else if (st === "Triggered") {
            push("policy", `Policy #${d.id} triggered at tier ${Number(d.tier_idx ?? 0) + 1}`, "gold");
          } else if (st === "Active") {
            push("policy", `Policy #${d.id} is active`, "good");
          } else if (st === "Void") {
            push("policy", `Policy #${d.id} voided — premium refunded`, "info");
          } else if (st === "Expired") {
            push("policy", `Policy #${d.id} expired — peg held`, "info");
          }
          void loadPolicies();
          break;
        }
        case "rfq":
          push("rfq", `${d.quotes} solver${Number(d.quotes) === 1 ? "" : "s"} quoted, ${d.declined} declined`, "info");
          break;
        case "arb":
          if (d.ok) push("arb", `Arbitrage bought the peg back`, "good", d.tx as string);
          break;
        case "keeper":
          if (d.ok && ["activate", "trigger", "expire", "pay"].includes(String(d.action)))
            push("keeper", `Keeper called ${d.action} on #${d.id}`, "info", d.tx as string);
          break;
        case "reset":
          push("reset", "Peg reset to $1.0000", "info", d.tx as string);
          break;
      }
    };
    return () => es.close();
  }, [push, loadPolicies]);

  // keep policies fresh even if an event is missed
  useEffect(() => {
    const t = setInterval(() => void loadPolicies(), 8000);
    return () => clearInterval(t);
  }, [loadPolicies]);

  const markShock = useCallback(() => setShockAt(Date.now()), []);

  const waited = Date.now() - startedAt.current;
  const status: LiveStatus = loaded
    ? "live"
    : waited > OFFLINE_AFTER_MS
      ? "offline"
      : waited > 4000 || attempts.current > 0
        ? "waking"
        : "loading";

  return { status, stale: !loaded && asOf !== null, asOf, state, price, gate, history, policies, feed, connected, error, paidAt, shockAt, refresh, markShock };
}

/** Turn live chain data into the diorama's scene. */
export function useScene(live: Live, myPolicies?: Policy[]): SceneState {
  return useMemo(() => {
    const p = live.price ? live.price.price_e8 / 1e8 : 1;
    const params = live.state?.params;
    const tiers: Tier[] = (params?.tiers ?? []).map((t, i) => ({
      price: t.below_price_e8 / 1e8,
      payout: t.payout_bps / 10_000,
      sustained: live.gate?.tiers?.[i]?.sustained ?? false,
    }));

    const source = myPolicies ?? live.policies;
    const houses = source.slice(-8).map((x) => ({
      id: x.id,
      state:
        x.status === "PaidOut" || x.status === "Triggered"
          ? ("paid" as const)
          : x.status === "Active"
            ? ("active" as const)
            : x.status === "Pending"
              ? ("pending" as const)
              : ("void" as const),
    }));

    const towers = (live.state?.solvers ?? []).map((s) => {
      const free = Number(s.free);
      const locked = Number(s.locked);
      const total = free + locked;
      return { id: s.id, committed: total > 0 ? locked / total : 0, out: !s.active };
    });

    return {
      price: p,
      tiers,
      band: (params?.band_e8 ?? 99_500_000) / 1e8,
      gateOpen: live.gate?.open ?? true,
      houses,
      towers,
      paidAt: live.paidAt,
      shockAt: live.shockAt,
    };
  }, [live.price, live.state, live.gate, live.policies, live.paidAt, live.shockAt, myPolicies]);
}
