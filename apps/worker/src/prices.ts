// Polls the on-chain pool price and Floor's gate state; keeps a short history for the solver strategies.
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";
import type { Bus } from "./events.js";

export interface PricePoint {
  t: number;
  price_e8: number;
}

export interface PoolSnapshot {
  t: number;
  price_e8: number;
  reserve_dusd: string;
  reserve_usd: string;
  swaps: number;
}

export interface Gate {
  open: boolean;
  reason: string | null;
  price_e8: number;
  price_ts: number;
  last_out_of_band_ts: number | null;
  tiers: Array<{ start_ts: number | null; sustained: boolean }>;
}

export class PriceFeed {
  latest?: PoolSnapshot;
  gate?: Gate;
  history: PricePoint[] = [];
  private timer?: NodeJS.Timeout;
  private gateTimer?: NodeJS.Timeout;
  private busy = false;
  private gateBusy = false;

  constructor(
    private chain: Chain,
    private cfg: Cfg,
    private bus: Bus,
    private maxHistory = 900,
  ) {}

  start(): void {
    void this.poll();
    void this.refreshGate();
    this.timer = setInterval(() => void this.poll(), 1000);
    this.gateTimer = setInterval(() => void this.refreshGate(), 2000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.gateTimer) clearInterval(this.gateTimer);
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = await this.chain.view<any>(this.cfg.pool, "get_state");
      if (s) {
        const snap: PoolSnapshot = {
          t: Date.now(),
          price_e8: Number(s.price_e8),
          reserve_dusd: String(s.reserve_dusd),
          reserve_usd: String(s.reserve_usd),
          swaps: Number(s.swaps),
        };
        this.latest = snap;
        this.history.push({ t: snap.t, price_e8: snap.price_e8 });
        if (this.history.length > this.maxHistory) this.history.shift();
        this.bus.emit("price", { ...snap, gate: this.gate ?? null }, false);
      }
    } catch {
      /* transient RPC error: keep the last good value, next tick retries */
    } finally {
      this.busy = false;
    }
  }

  async refreshGate(): Promise<void> {
    if (this.gateBusy) return;
    this.gateBusy = true;
    try {
      const g = await this.chain.view<any>(this.cfg.floor, "get_gate");
      if (g) {
        this.gate = {
          open: !!g.open,
          reason: g.reason ?? null,
          price_e8: Number(g.price_e8),
          price_ts: Number(g.price_ts),
          last_out_of_band_ts: g.last_out_of_band_ts == null ? null : Number(g.last_out_of_band_ts),
          tiers: g.tiers ?? [],
        };
      }
    } catch {
      /* ignore */
    } finally {
      this.gateBusy = false;
    }
  }

  /** Prices seen in the last `seconds` seconds, oldest first (always includes the latest). */
  recentPrices(seconds: number): number[] {
    const cutoff = Date.now() - seconds * 1000;
    const xs = this.history.filter((p) => p.t >= cutoff).map((p) => p.price_e8);
    if (xs.length === 0 && this.latest) xs.push(this.latest.price_e8);
    return xs;
  }
}
