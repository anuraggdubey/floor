// NEAR access: failover reads, serialised per-account writes, and parsing of EVENT_JSON logs.
import { Account, JsonRpcProvider, teraToGas } from "near-api-js";
import type { Cfg } from "./config.js";

export interface ChainEvent {
  standard: string;
  event: string;
  data: Record<string, any>;
}

export interface TxResult {
  ok: boolean;
  hash: string;
  logs: string[];
  events: ChainEvent[];
  returnValue?: unknown;
  error?: string;
}

export function parseEvents(logs: string[]): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const l of logs) {
    const i = l.indexOf("EVENT_JSON:");
    if (i < 0) continue;
    try {
      out.push(JSON.parse(l.slice(i + "EVENT_JSON:".length)));
    } catch {
      /* ignore malformed log lines */
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public RPCs answer HTTP 429 or a JSON-RPC error with code -429 / "Rate limit" when throttling. */
export function isRateLimited(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /429|rate limit/i.test(m);
}

export class Chain {
  private providers: JsonRpcProvider[];
  private accounts = new Map<string, Account>();
  private queues = new Map<string, Promise<unknown>>();
  private rr = 0;
  /** Short-lived read cache plus in-flight sharing: ten browsers asking the same question cost one RPC call. */
  private cache = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private cfg: Cfg) {
    this.providers = cfg.rpcUrls.map((url) => new JsonRpcProvider({ url }));
  }

  /**
   * Read-only call. Identical calls within `ttlMs` share one answer (and concurrent ones share one request),
   * reads are spread round-robin over the endpoints, and a rate-limit response backs off and retries instead
   * of surfacing to the visitor. Returns undefined when the contract returns null.
   */
  async view<T = any>(
    contractId: string,
    method: string,
    args: Record<string, unknown> = {},
    ttlMs = 1500,
  ): Promise<T | undefined> {
    const key = `${contractId}|${method}|${JSON.stringify(args)}`;
    const hit = this.cache.get(key);
    if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.value as T | undefined;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T | undefined>;

    const run = (async () => {
      let lastErr: unknown;
      const n = this.providers.length;
      for (let attempt = 0; attempt < 4; attempt++) {
        const start = this.rr++ % n;
        for (let i = 0; i < n; i++) {
          const p = this.providers[(start + i) % n]!;
          try {
            const value = (await p.callFunction({ contractId, method, args })) as T | undefined;
            this.cache.set(key, { at: Date.now(), value });
            return value;
          } catch (e) {
            lastErr = e;
            const msg = String((e as Error)?.message ?? e);
            // A contract panic is a real answer, not an RPC outage: do not retry elsewhere.
            if (msg.includes("Smart contract panicked")) throw e;
          }
        }
        // every endpoint refused: if it looks like rate limiting, wait and try again
        if (!isRateLimited(lastErr)) break;
        await sleep(600 * 2 ** attempt);
      }
      // a stale answer beats an error when the network is merely busy
      if (hit && isRateLimited(lastErr)) return hit.value as T | undefined;
      throw lastErr;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  account(id: string, key: string): Account {
    let a = this.accounts.get(id);
    if (!a) {
      a = new Account(id, this.providers[0]!, key as any);
      this.accounts.set(id, a);
    }
    return a;
  }

  /** Serialise transactions per signer so nonces never collide. */
  private enqueue<T>(signer: string, job: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(signer) ?? Promise.resolve();
    const next = prev.then(job, job);
    this.queues.set(signer, next.catch(() => undefined));
    return next;
  }

  /** Call a contract method and wait for every receipt, so callback logs (events) are included. */
  send(
    signer: Account,
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
    opts: { tgas?: number; deposit?: bigint | string } = {},
  ): Promise<TxResult> {
    return this.enqueue(signer.accountId, async () => {
     for (let attempt = 0; ; attempt++) {
      try {
        const res: any = await signer.callFunctionRaw({
          contractId,
          methodName,
          args,
          gas: teraToGas(`${opts.tgas ?? 100}`),
          deposit: opts.deposit ?? 0n,
          waitUntil: "EXECUTED",
        });
        const logs: string[] = (res.receipts_outcome ?? []).flatMap((o: any) => o.outcome?.logs ?? []);
        const hash: string = res.transaction_outcome?.id ?? res.transaction?.hash ?? "";
        const failure = res.status?.Failure;
        let returnValue: unknown;
        const sv = res.status?.SuccessValue;
        if (typeof sv === "string" && sv.length > 0) {
          try {
            returnValue = JSON.parse(Buffer.from(sv, "base64").toString("utf8"));
          } catch {
            returnValue = sv;
          }
        }
        return {
          ok: !failure,
          hash,
          logs,
          events: parseEvents(logs),
          returnValue,
          error: failure ? JSON.stringify(failure).slice(0, 400) : undefined,
        };
      } catch (e) {
        if (attempt < 3 && isRateLimited(e)) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        return { ok: false, hash: "", logs: [], events: [], error: String((e as Error)?.message ?? e).slice(0, 400) };
      }
     }
    });
  }

  explorerTx(hash: string): string {
    return hash ? `${this.cfg.explorer}/transactions/${hash}` : "";
  }
}
