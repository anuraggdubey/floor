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

export class Chain {
  private providers: JsonRpcProvider[];
  private accounts = new Map<string, Account>();
  private queues = new Map<string, Promise<unknown>>();

  constructor(private cfg: Cfg) {
    this.providers = cfg.rpcUrls.map((url) => new JsonRpcProvider({ url }));
  }

  /** Read-only call with failover across RPC endpoints. Returns undefined when the contract returns null. */
  async view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T | undefined> {
    let lastErr: unknown;
    for (const p of this.providers) {
      try {
        return (await p.callFunction({ contractId, method, args })) as T | undefined;
      } catch (e) {
        lastErr = e;
        // A contract panic is a real answer, not an RPC outage: do not retry elsewhere.
        if (String((e as Error)?.message ?? e).includes("Smart contract panicked")) throw e;
      }
    }
    throw lastErr;
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
        return { ok: false, hash: "", logs: [], events: [], error: String((e as Error)?.message ?? e).slice(0, 400) };
      }
    });
  }

  explorerTx(hash: string): string {
    return hash ? `${this.cfg.explorer}/transactions/${hash}` : "";
  }
}
