// Tiny in-memory event bus. The keeper, arbitrage bot and API server publish; the SSE stream subscribes.
import { EventEmitter } from "node:events";

export interface BusEvent {
  id: number;
  ts: number;
  kind: string;
  data: Record<string, unknown>;
}

export class Bus {
  private em = new EventEmitter();
  private seq = 0;
  readonly recent: BusEvent[] = [];

  constructor(private keep = 200) {
    this.em.setMaxListeners(0);
  }

  /** `store: false` is for high-frequency ticks (prices) that new SSE clients do not need replayed. */
  emit(kind: string, data: Record<string, unknown> = {}, store = true): BusEvent {
    const ev: BusEvent = { id: ++this.seq, ts: Date.now(), kind, data };
    if (store) {
      this.recent.push(ev);
      if (this.recent.length > this.keep) this.recent.shift();
    }
    this.em.emit("event", ev);
    return ev;
  }

  subscribe(fn: (ev: BusEvent) => void): () => void {
    this.em.on("event", fn);
    return () => this.em.off("event", fn);
  }
}
