// HTTP API for the web app: guest accounts, live state (SSE), RFQ and quotes, buying cover, dumping the peg.
import crypto from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Chain } from "./chain.js";
import type { Cfg } from "./config.js";
import type { Bus } from "./events.js";
import type { PriceFeed } from "./prices.js";
import type { Bots, SignedOffer } from "./bots.js";
import type { Guests } from "./guests.js";
import { paramsHash } from "./quote.js";

type Keeper = { ensureFresh(maxAgeMs?: number): Promise<void> };
type Arb = { setEnabled(v: boolean): void };

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Parse a decimal string or number in human units into base units. */
export function toBase(x: unknown, decimals = 6): bigint {
  const s = String(x ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new HttpError(400, "BAD_AMOUNT", `amount must be a positive number, got "${s}"`);
  const [i, f = ""] = s.split(".");
  return BigInt(i! + f.padEnd(decimals, "0").slice(0, decimals));
}

/** Sender balances on the EVM chain, via plain JSON-RPC (no viem), cached so the UI can poll freely. */
let fundingCache: { at: number; usdc: string; eth: string } | null = null;
async function evmFunding(cfg: Cfg, token: string): Promise<{ usdc: string; eth: string } | null> {
  if (!cfg.evmRpcUrl || !cfg.evmPoolAddress) return null;
  if (fundingCache && Date.now() - fundingCache.at < 20_000) return fundingCache;
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(cfg.evmRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(6000),
    });
    const j = (await r.json()) as { result?: string; error?: unknown };
    if (j.error || !j.result) throw new Error("rpc");
    return j.result;
  };
  try {
    const addr = cfg.evmPoolAddress.toLowerCase().replace(/^0x/, "");
    const [eth, usdc] = await Promise.all([
      rpc("eth_getBalance", [cfg.evmPoolAddress, "latest"]),
      rpc("eth_call", [{ to: token, data: "0x70a08231" + "0".repeat(24) + addr }, "latest"]),
    ]);
    fundingCache = { at: Date.now(), eth: BigInt(eth).toString(), usdc: BigInt(usdc).toString() };
    return fundingCache;
  } catch {
    return fundingCache; // stale is better than nothing
  }
}

export function startServer(deps: { chain: Chain; cfg: Cfg; bus: Bus; feed: PriceFeed; bots: Bots; guests: Guests; keeper: Keeper; arb: Arb }) {
  const { chain, cfg, bus, feed, bots, guests, keeper, arb } = deps;
  const rfqs = new Map<string, { holder: string; offers: SignedOffer[]; at: number }>();
  const lastDump = new Map<string, number>();

  function cors(res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", cfg.webOrigin);
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-guest-token, x-admin-token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  function send(res: ServerResponse, status: number, body: unknown) {
    cors(res);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  }

  async function readJson(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 64 * 1024) throw new HttpError(413, "TOO_LARGE", "request body too large");
      chunks.push(c as Buffer);
    }
    if (size === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError(400, "BAD_JSON", "request body is not valid JSON");
    }
  }

  function guestFrom(req: IncomingMessage, body: any) {
    const token = String(req.headers["x-guest-token"] ?? body?.token ?? "");
    const acct = token ? guests.account(token) : undefined;
    if (!acct) throw new HttpError(401, "NO_GUEST", "create a guest account first (POST /api/guest)");
    return { token, acct };
  }

  async function balances(accountId: string, acct: any) {
    const [fusdc, pool, near] = await Promise.all([
      chain.view<string>(cfg.fusdc, "ft_balance_of", { account_id: accountId }),
      chain.view<[string, string]>(cfg.pool, "get_balances", { account_id: accountId }),
      acct.getBalance().catch(() => 0n),
    ]);
    return { fusdc: fusdc ?? "0", dusd: pool?.[0] ?? "0", usd: pool?.[1] ?? "0", near: String(near) };
  }

  const STRATEGY_NAME: Record<string, string> = { volatility: "Volatility", history: "History", aggressive: "Aggressive" };

  async function state() {
    const [params, stats, solvers] = await Promise.all([
      bots.getParams(),
      chain.view<any>(cfg.floor, "get_pool_stats"),
      chain.view<Array<[string, any]>>(cfg.floor, "list_solvers"),
    ]);
    const byId = new Map(cfg.solvers.map((s) => [s.id, s]));
    return {
      contracts: { fusdc: cfg.fusdc, pool: cfg.pool, floor: cfg.floor, explorer: cfg.explorer },
      params,
      params_hash: paramsHash(params),
      price: feed.latest ?? null,
      gate: feed.gate ?? null,
      stats,
      solvers: (solvers ?? []).map(([id, s]) => ({
        id,
        name: STRATEGY_NAME[byId.get(id)?.strategy ?? ""] ?? id,
        strategy: byId.get(id)?.strategy ?? null,
        scripted: true,
        free: s.free,
        locked: s.locked,
        active: s.active,
      })),
      history: feed.history.slice(-600).map((p) => [p.t, p.price_e8]),
    };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0]!.trim();
    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204).end();
      return;
    }

    if (req.method === "GET" && p === "/api/health") {
      return send(res, 200, {
        ok: true,
        price_age_ms: feed.latest ? Date.now() - feed.latest.t : null,
        guests: guests.count,
        contracts: { fusdc: cfg.fusdc, pool: cfg.pool, floor: cfg.floor },
      });
    }

    if (req.method === "GET" && p === "/api/state") return send(res, 200, await state());

    if (req.method === "GET" && p === "/api/stream") {
      cors(res);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
      const write = (kind: string, data: unknown) => res.write(`data: ${JSON.stringify({ kind, data })}\n\n`);
      write("snapshot", { price: feed.latest ?? null, gate: feed.gate ?? null, events: bus.recent.slice(-50) });
      const unsub = bus.subscribe((ev) => write(ev.kind, { ...ev.data, ts: ev.ts, eid: ev.id }));
      const hb = setInterval(() => res.write(": hb\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(hb);
        unsub();
      });
      return;
    }

    if (req.method === "POST" && p === "/api/guest") {
      try {
        const g = await guests.create(ip);
        const acct = guests.account(g.token)!;
        return send(res, 200, { token: g.token, accountId: g.accountId, balances: await balances(g.accountId, acct), custodial_testnet: true });
      } catch (e) {
        const m = String((e as Error).message);
        const code = m.split(":")[0] ?? "ERROR";
        throw new HttpError(code === "GUEST_LIMIT" || code === "RATE_LIMIT" ? 429 : 500, code, m);
      }
    }

    if (req.method === "GET" && p === "/api/me") {
      const { token, acct } = guestFrom(req, {});
      return send(res, 200, { accountId: guests.accountId(token), balances: await balances(acct.accountId, acct) });
    }

    if (req.method === "POST" && p === "/api/faucet") {
      const { acct } = guestFrom(req, await readJson(req));
      const [a, b] = await Promise.all([
        chain.send(acct, cfg.fusdc, "faucet", {}, { tgas: 30 }),
        chain.send(acct, cfg.pool, "claim_demo", {}, { tgas: 30 }),
      ]);
      return send(res, 200, { fusdc: { ok: a.ok, error: a.error, tx: a.hash }, pool: { ok: b.ok, error: b.error, tx: b.hash } });
    }

    if (req.method === "POST" && p === "/api/rfq") {
      const body = await readJson(req);
      const { token } = guestFrom(req, body);
      const params = await bots.getParams();
      const notional = toBase(body.notional);
      if (notional < 10_000_000n || notional > 5_000_000_000n) throw new HttpError(400, "BAD_NOTIONAL", "notional must be between 10 and 5,000 fUSDC");
      const tenor = Number(body.tenor_secs ?? 300);
      if (!Number.isInteger(tenor) || tenor <= params.wait_secs || tenor > params.max_tenor_secs)
        throw new HttpError(400, "BAD_TENOR", `tenor must be between ${params.wait_secs + 1} and ${params.max_tenor_secs} seconds`);
      await keeper.ensureFresh();
      await feed.refreshGate();
      const rfqId = "rfq-" + crypto.randomBytes(6).toString("hex");
      const holder = guests.accountId(token)!;
      const q = await bots.quote(holder, notional, tenor, rfqId);
      rfqs.set(rfqId, { holder, offers: q.offers, at: Date.now() });
      for (const [k, v] of rfqs) if (Date.now() - v.at > 10 * 60_000) rfqs.delete(k);
      const best = q.offers[0]?.solver ?? null;
      bus.emit("rfq", { rfq_id: rfqId, holder, notional: notional.toString(), quotes: q.offers.length, declined: q.declined.length, best });
      return send(res, 200, {
        rfq_id: rfqId,
        gate: q.gate,
        price_e8: q.price_e8,
        best,
        offers: q.offers.map((o) => ({ solver: o.solver, name: o.name, strategy: o.strategy, scripted: !o.ai, ai: o.ai, thought: o.thought, latency_ms: o.latency_ms, premium: o.premium, max_payout: o.max_payout, capacity: o.capacity, expires_ts: o.expires_ts })),
        declined: q.declined,
      });
    }

    if (req.method === "POST" && p === "/api/buy") {
      const body = await readJson(req);
      const { token, acct } = guestFrom(req, body);
      const rfq = rfqs.get(String(body.rfq_id));
      if (!rfq || rfq.holder !== guests.accountId(token)) throw new HttpError(404, "NO_RFQ", "unknown or expired RFQ");
      const offer = rfq.offers.find((o) => o.solver === body.solver);
      if (!offer) throw new HttpError(404, "NO_OFFER", "that solver did not quote this RFQ");
      const msg = JSON.stringify({ action: "buy", quote: offer.quote, signature: offer.signature });
      const r = await chain.send(
        acct,
        cfg.fusdc,
        "ft_transfer_call",
        { receiver_id: cfg.floor, amount: offer.premium, msg },
        { tgas: 100, deposit: 1n },
      );
      const created = r.events.find((e) => e.standard === "floor" && e.event === "policy_created");
      const rejected = r.events.find((e) => e.standard === "floor" && e.event === "rejected");
      const out = {
        ok: !!created,
        policy_id: created?.data?.id ?? null,
        rejected: rejected?.data?.code ?? (r.ok ? null : "TX_FAILED"),
        tx: r.hash,
        tx_url: chain.explorerTx(r.hash),
        error: r.error ?? null,
      };
      bus.emit("buy", { holder: guests.accountId(token), solver: offer.solver, ...out });
      return send(res, 200, out);
    }

    if (req.method === "POST" && p === "/api/dump") {
      const body = await readJson(req);
      const { token, acct } = guestFrom(req, body);
      const amount = toBase(body.amount);
      if (amount < 1_000_000n || amount > 100_000_000_000n) throw new HttpError(400, "BAD_AMOUNT", "dump between 1 and 100,000 dUSD");
      const now = Date.now();
      if (now - (lastDump.get(token) ?? 0) < 1500) throw new HttpError(429, "SLOW_DOWN", "one dump every 1.5 seconds");
      lastDump.set(token, now);
      const before = feed.latest?.price_e8 ?? null;
      const r = await chain.send(acct, cfg.pool, "sell_dusd", { amount: amount.toString() }, { tgas: 30 });
      const after = await chain.view<string>(cfg.pool, "get_price_e8");
      bus.emit("dump", { holder: guests.accountId(token), amount: amount.toString(), ok: r.ok, tx: r.hash, price_before: before, price_after: Number(after) });
      return send(res, 200, { ok: r.ok, tx: r.hash, tx_url: chain.explorerTx(r.hash), price_e8: Number(after), error: r.error ?? null });
    }

    // ----------------------------------------------------- cross-chain payout
    if (req.method === "GET" && p === "/api/evm") {
      const [evm, payouts] = await Promise.all([
        chain.view<any>(cfg.floor, "get_evm_chain"),
        chain.view<any[]>(cfg.floor, "list_evm_payouts"),
      ]);
      let mine: string | null = null;
      const token = String(req.headers["x-guest-token"] ?? "");
      const who = token ? guests.accountId(token) : undefined;
      if (who) mine = (await chain.view<string>(cfg.floor, "get_payout_address", { account_id: who })) ?? null;
      return send(res, 200, {
        enabled: !!evm && !!cfg.evmRpcUrl,
        chain: evm ?? null,
        poolAddress: cfg.evmPoolAddress || null,
        explorer: cfg.evmExplorer,
        funding: evm ? await evmFunding(cfg, evm.token) : null,
        myAddress: mine,
        payouts: payouts ?? [],
      });
    }

    if (req.method === "POST" && p === "/api/payout-address") {
      const body = await readJson(req);
      const { acct } = guestFrom(req, body);
      const address = String(body.address ?? "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new HttpError(400, "BAD_ADDRESS", "that is not a 20-byte EVM address");
      const r = await chain.send(acct, cfg.floor, "set_payout_address", { address }, { tgas: 30 });
      if (!r.ok) throw new HttpError(500, "SET_FAILED", r.error ?? "could not save the address");
      bus.emit("payout_address", { account: acct.accountId, address, tx: r.hash });
      return send(res, 200, { ok: true, address, tx: r.hash, tx_url: chain.explorerTx(r.hash) });
    }

    if (req.method === "GET" && p === "/api/policies") {
      const holder = url.searchParams.get("holder");
      const stats = await chain.view<any>(cfg.floor, "get_pool_stats");
      const count = Number(stats?.policies ?? 0);
      const list = count > 0 ? ((await chain.view<any[]>(cfg.floor, "list_policies", { from_index: Math.max(0, count - 100), limit: 100 })) ?? []) : [];
      return send(res, 200, { policies: list.filter((x) => !holder || x.holder === holder).reverse() });
    }

    const m = p.match(/^\/api\/policies\/(\d+)$/);
    if (req.method === "GET" && m) {
      const pol = await chain.view<any>(cfg.floor, "get_policy", { policy_id: Number(m[1]) });
      if (!pol) throw new HttpError(404, "NO_POLICY", "no such policy");
      return send(res, 200, pol);
    }

    if (req.method === "POST" && p === "/api/admin/reset") {
      if (!cfg.adminApiToken || req.headers["x-admin-token"] !== cfg.adminApiToken) throw new HttpError(403, "FORBIDDEN", "admin token required");
      const admin = chain.account(cfg.admin.id, cfg.admin.key);
      const r = await chain.send(admin, cfg.pool, "reset", {}, { tgas: 30 });
      bus.emit("reset", { ok: r.ok, tx: r.hash });
      return send(res, 200, { ok: r.ok, tx: r.hash, error: r.error ?? null });
    }

    if (req.method === "POST" && p === "/api/admin/arb") {
      if (!cfg.adminApiToken || req.headers["x-admin-token"] !== cfg.adminApiToken) throw new HttpError(403, "FORBIDDEN", "admin token required");
      const body = await readJson(req);
      arb.setEnabled(!!body.enabled);
      return send(res, 200, { ok: true, enabled: !!body.enabled });
    }

    throw new HttpError(404, "NOT_FOUND", `no route for ${req.method} ${p}`);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } });
      console.error("API error:", e);
      send(res, 500, { error: { code: "INTERNAL", message: String(e?.message ?? e).slice(0, 300) } });
    });
  });
  server.listen(cfg.port, () => console.log(`Floor worker API on http://localhost:${cfg.port}`));
  return server;
}
