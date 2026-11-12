// Types and helpers for the worker API. Everything is proxied through /api on this origin (see next.config.ts).

export interface Params {
  band_e8: number;
  tiers: Array<{ below_price_e8: number; payout_bps: number }>;
  sustain_secs: number;
  settle_secs: number;
  lookback_secs: number;
  wait_secs: number;
  stale_secs: number;
  max_tenor_secs: number;
  exposure_cap: string;
}

export interface PricePoint {
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

export interface Stats {
  solvers: number;
  policies: number;
  free_margin: string;
  locked_margin: string;
  exposure_cap: string;
}

export interface SolverView {
  id: string;
  name: string;
  strategy: string | null;
  scripted: boolean;
  free: string;
  locked: string;
  active: boolean;
}

export interface FloorState {
  contracts: { fusdc: string; pool: string; floor: string; explorer: string };
  params: Params;
  params_hash: string;
  price: PricePoint | null;
  gate: Gate | null;
  stats: Stats;
  solvers: SolverView[];
  history: Array<[number, number]>;
}

export type PolicyStatus = "Pending" | "Active" | "Void" | "Triggered" | "PaidOut" | "Expired";

export interface Policy {
  id: number;
  holder: string;
  solver: string;
  notional: string;
  premium: string;
  max_payout: string;
  created_ts: number;
  activate_ts: number;
  expires_ts: number;
  status: PolicyStatus;
  tier_idx: number | null;
  payout_amount: string;
  owed: string;
  paying: boolean;
}

export interface Offer {
  solver: string;
  name: string;
  strategy: string;
  scripted: boolean;
  ai?: boolean;
  thought?: string | null;
  latency_ms?: number | null;
  premium: string;
  max_payout: string;
  capacity: string;
  expires_ts: number;
}

export interface RfqResult {
  rfq_id: string;
  gate: Gate | null;
  price_e8: number;
  best: string | null;
  offers: Offer[];
  declined: Array<{ solver: string; name: string; reason: string; ai?: boolean; thought?: string | null }>;
}

export interface Balances {
  fusdc: string;
  dusd: string;
  usd: string;
  near: string;
}

export const GUEST_KEY = "floor.guest.token";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Base URL of the worker API. Empty (default) means same origin: `next dev` proxies /api to the worker. In a hosted
 * deployment set NEXT_PUBLIC_API_URL to the worker URL so the browser (and the SSE stream) talk to it directly.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(GUEST_KEY) : null;
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-guest-token": token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(e?.code ?? String(res.status), e?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export interface EvmChainInfo {
  name: string;
  chain_id: number;
  token: string;
  path: string;
  signer: string;
  cap: string;
}

export interface EvmPayout {
  id: number;
  policy_id: number;
  to: string;
  amount: string;
  status: "Reserved" | "Signing" | "Signed" | "Confirmed";
  sighash: string | null;
  signature: string | null;
  evm_tx: string | null;
  nonce: number | null;
}

export interface EvmView {
  enabled: boolean;
  chain: EvmChainInfo | null;
  poolAddress: string | null;
  explorer: string;
  /** Balances of the contract-controlled sender (USDC has 6 decimals, ETH is in wei); null if unreadable. */
  funding?: { usdc: string; eth: string } | null;
  myAddress: string | null;
  payouts: EvmPayout[];
}

export const api = {
  evm: () => call<EvmView>("/api/evm"),
  setPayoutAddress: (address: string) =>
    call<{ ok: boolean; address: string; tx: string; tx_url: string }>("/api/payout-address", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
  state: () => call<FloorState>("/api/state"),
  me: () => call<{ accountId: string; balances: Balances }>("/api/me"),
  guest: () => call<{ token: string; accountId: string; balances: Balances }>("/api/guest", { method: "POST" }),
  faucet: () => call<unknown>("/api/faucet", { method: "POST", body: "{}" }),
  rfq: (notional: number, tenor_secs: number) =>
    call<RfqResult>("/api/rfq", { method: "POST", body: JSON.stringify({ notional, tenor_secs }) }),
  buy: (rfq_id: string, solver: string) =>
    call<{ ok: boolean; policy_id: number | null; rejected: string | null; tx: string; tx_url: string; error: string | null }>(
      "/api/buy",
      { method: "POST", body: JSON.stringify({ rfq_id, solver }) },
    ),
  dump: (amount: number) =>
    call<{ ok: boolean; tx: string; tx_url: string; price_e8: number; error: string | null }>("/api/dump", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  policies: (holder?: string) =>
    call<{ policies: Policy[] }>(`/api/policies${holder ? `?holder=${encodeURIComponent(holder)}` : ""}`),
};

// ------------------------------------------------------------------ format
/** fUSDC and the pool credits all use 6 decimals. */
export function usdc(base: string | number | bigint, dp = 2): string {
  const n = Number(base) / 1e6;
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function price(e8: number, dp = 4): string {
  return (e8 / 1e8).toFixed(dp);
}

export function tierPrice(below_price_e8: number): number {
  return below_price_e8 / 1e8;
}

export function shortTx(hash: string): string {
  return hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : "";
}
