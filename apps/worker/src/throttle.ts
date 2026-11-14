// Small abuse and load guards for the public API. Pure and dependency-free so they are unit-tested.

/** At most one call per `ms` for each key (a guest token, an IP, ...). */
export class Throttle {
  private last = new Map<string, number>();

  constructor(
    private ms: number,
    private now: () => number = Date.now,
  ) {}

  /** 0 if the call is allowed (and is recorded); otherwise how many milliseconds the caller must wait. */
  hit(key: string): number {
    const t = this.now();
    const prev = this.last.get(key);
    if (prev !== undefined && t - prev < this.ms) return this.ms - (t - prev);
    this.last.set(key, t);
    if (this.last.size > 5000) {
      for (const [k, v] of this.last) if (t - v >= this.ms) this.last.delete(k);
    }
    return 0;
  }
}

/**
 * Memoise an async read for `ttlMs` and share one in-flight call between concurrent callers, so a crowd of
 * visitors costs the chain RPC one request per window, not one each. If the read fails, the last good value is
 * served (a free public RPC that is rate-limiting us should not blank every visitor's page).
 */
export function memoAsync<T>(fn: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let value: { at: number; v: T } | null = null;
  let inflight: Promise<T> | null = null;
  return () => {
    if (value && now() - value.at < ttlMs) return Promise.resolve(value.v);
    if (inflight) return inflight;
    inflight = fn()
      .then((v) => {
        value = { at: now(), v };
        return v;
      })
      .catch((e) => {
        if (value) return value.v;
        throw e;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
