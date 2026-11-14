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
  return /(^|[^\w])-?429([^\w]|$)|rate limit|too many requests/i.test(m);
}

/** An endpoint that refused us before doing any work: throttled, unreachable or discontinued. Safe to try elsewhere. */
export function isEndpointFailure(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  // A contract panic or an on-chain failure is a real answer and never an endpoint problem.
  if (/Smart contract panicked|ExecutionError|FunctionCallError/i.test(m)) return false;
  return (
    isRateLimited(e) ||
    /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|internal server error|bad gateway|service unavailable|gateway time-?out|HTTP (status )?5\d\d/i.test(m)
  );
}

/**
 * A transaction that has not confirmed after this long is reported as failed instead of hanging the caller. It is
 * never retried: the transaction may well have landed, and sending it again could act twice.
 */
const SEND_TIMEOUT_MS = 40_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("TX_TIMEOUT: the network did not confirm in time")), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/** How long an endpoint that just throttled us is left alone. */
const COOL_MS = 25_000;

export class Chain {
  private providers: JsonRpcProvider[];
  private accounts = new Map<string, Account>();
  /** Secret keys by account id, so a transaction can be re-signed through another endpoint. */
  private keys = new Map<string, string>();
  /** The same account bound to each endpoint, built on first use. */
  private perEndpoint = new Map<string, Account>();
  private queues = new Map<string, Promise<unknown>>();
  private rr = 0;
  /** Per endpoint: do not use it before this time (it just throttled us). */
  private coolUntil: number[] = [];
  /** Short-lived read cache plus in-flight sharing: ten browsers asking the same question cost one RPC call. */
  private cache = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private cfg: Cfg) {
    this.providers = cfg.rpcUrls.map((url) => new JsonRpcProvider({ url }));
    this.coolUntil = this.providers.map(() => 0);
  }

  /**
   * Endpoint indexes in the order to try them, cooled-down ones last. Reads rotate to spread load. Writes are sticky
   * (config order): a transaction should be sent and confirmed through the same well-synced node, because a node
   * that lags makes the SDK wait on a result it cannot see yet.
   */
  private order(sticky = false): number[] {
    const n = this.providers.length;
    const now = Date.now();
    const start = sticky ? 0 : this.rr++ % n;
    const all = Array.from({ length: n }, (_, i) => (start + i) % n);
    return [...all.filter((i) => this.coolUntil[i]! <= now), ...all.filter((i) => this.coolUntil[i]! > now)];
  }

  private cool(i: number) {
    this.coolUntil[i] = Date.now() + COOL_MS;
  }

  /** The signer bound to endpoint `i`. Falls back to the caller's own Account when its key is unknown. */
  private signerAt(signer: Account, i: number): Account {
    const key = this.keys.get(signer.accountId);
    if (!key) return signer;
    const k = `${signer.accountId}@${i}`;
    let a = this.perEndpoint.get(k);
    if (!a) {
      a = new Account(signer.accountId, this.providers[i]!, key as any);
      this.perEndpoint.set(k, a);
    }
    return a;
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
      for (let attempt = 0; attempt < 3; attempt++) {
        for (const idx of this.order()) {
          const p = this.providers[idx]!;
          try {
            const value = (await p.callFunction({ contractId, method, args })) as T | undefined;
            this.cache.set(key, { at: Date.now(), value });
            return value;
          } catch (e) {
            lastErr = e;
            const msg = String((e as Error)?.message ?? e);
            // A contract panic is a real answer, not an RPC outage: do not retry elsewhere.
            if (msg.includes("Smart contract panicked")) throw e;
            if (isEndpointFailure(e)) this.cool(idx);
          }
        }
        // every endpoint refused: if it looks like rate limiting, wait and try again
        if (!isEndpointFailure(lastErr)) break;
        await sleep(500 * 2 ** attempt);
      }
      // a stale answer beats an error when the network is merely busy
      if (hit && isEndpointFailure(lastErr)) return hit.value as T | undefined;
      throw lastErr;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, run);
    return run;
  }

  account(id: string, key: string): Account {
    this.keys.set(id, key);
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
     const n = this.providers.length;
     const tried: number[] = [];
     for (let attempt = 0; ; attempt++) {
      // first healthy endpoint we have not just failed on; once all have been tried, start over after a pause
      const idx = this.order(true).find((i) => !tried.includes(i)) ?? this.order(true)[0]!;
      tried.push(idx);
      try {
        const res: any = await withTimeout(this.signerAt(signer, idx).callFunctionRaw({
          contractId,
          methodName,
          args,
          gas: teraToGas(`${opts.tgas ?? 100}`),
          deposit: opts.deposit ?? 0n,
          waitUntil: "EXECUTED",
        }), SEND_TIMEOUT_MS);
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
        if (attempt < n + 2 && (isEndpointFailure(e) || /InvalidNonce/i.test(String(e)))) {
          this.cool(idx);
          // moving to a different host needs no pause; only a full lap does
          if (tried.length >= n) {
            tried.length = 0;
            await sleep(900);
          }
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
