// Loads the repo-root .env (never committed) and exposes typed configuration.
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export interface SolverCfg {
  id: string;
  key: string;
  seed: string;
  /** Strategy label shown in the UI. All solvers are scripted and labelled as such. */
  strategy: "volatility" | "history" | "aggressive";
}

export interface Cfg {
  port: number;
  rpcUrls: string[];
  fusdc: string;
  pool: string;
  floor: string;
  admin: { id: string; key: string };
  keeper: { id: string; key: string };
  arb: { id: string; key: string };
  guestParent: { id: string; key: string };
  solvers: SolverCfg[];
  encSecret: string;
  adminApiToken: string;
  webOrigin: string;
  arbDelaySecs: number;
  guestNear: string;
  maxGuests: number;
  stateDir: string;
  explorer: string;
  /** Cross-chain payout leg; off entirely when the RPC URL is unset. */
  evmRpcUrl: string;
  /** The address the Floor contract controls via Chain Signatures (scripts/derive-evm-address.mjs). */
  evmPoolAddress: string;
  evmExplorer: string;
}

export function loadConfig(): Cfg {
  // Every free public RPC rate-limits a single client quickly, so the worker spreads reads and fails writes over
  // several independent hosts. Order is preference: the first healthy endpoint is used, a rate-limited one is
  // skipped for a while. NEAR_RPC_URL is tried first; NEAR_RPC_URLS (comma separated) adds more, e.g. a keyed
  // FastNEAR URL. See https://docs.near.org/api/rpc/providers
  const rpc = opt("NEAR_RPC_URL", "https://test.rpc.fastnear.com");
  const extra = opt("NEAR_RPC_URLS", "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return {
    // Hosts such as Render inject PORT; WORKER_PORT wins locally.
    port: Number(opt("WORKER_PORT", opt("PORT", "8787"))),
    rpcUrls: [
      rpc,
      ...extra,
      "https://test.rpc.fastnear.com",
      "https://near-testnet.drpc.org",
      "https://rpc.testnet.fastnear.com",
      "https://archival-rpc.testnet.fastnear.com",
      "https://archival-rpc.testnet.near.org", // slow (about 3s) but independent, so it is the last resort
    ].filter((v, i, a) => a.indexOf(v) === i),
    fusdc: req("FUSDC_CONTRACT"),
    pool: req("POOL_CONTRACT"),
    floor: req("FLOOR_CONTRACT"),
    admin: { id: req("ADMIN_ACCOUNT"), key: req("ADMIN_KEY") },
    keeper: { id: req("KEEPER_ACCOUNT"), key: req("KEEPER_KEY") },
    arb: { id: req("ARB_ACCOUNT"), key: req("ARB_KEY") },
    guestParent: { id: req("GUEST_PARENT"), key: req("GUEST_PARENT_KEY") },
    solvers: [
      { id: req("SOLVER_A_ACCOUNT"), key: req("SOLVER_A_KEY"), seed: req("SOLVER_A_QUOTE_SEED"), strategy: "volatility" },
      { id: req("SOLVER_B_ACCOUNT"), key: req("SOLVER_B_KEY"), seed: req("SOLVER_B_QUOTE_SEED"), strategy: "history" },
      { id: req("SOLVER_C_ACCOUNT"), key: req("SOLVER_C_KEY"), seed: req("SOLVER_C_QUOTE_SEED"), strategy: "aggressive" },
    ],
    encSecret: req("ENC_SECRET"),
    adminApiToken: opt("ADMIN_API_TOKEN", ""),
    // A trailing slash (easy to paste) would never match the browser's Origin header and silently block every call.
    webOrigin: opt("WEB_ORIGIN", "*").trim().replace(/\/+$/, ""),
    // After a sustained breach the arbitrage bot waits this long before buying the peg back,
    // so the sustain window can complete and the trigger can fire.
    arbDelaySecs: Number(opt("ARB_DELAY_SECS", "75")),
    // near-api-js checks balance >= prepaid gas * ~10x gas price before sending, so a guest needs about 0.1 NEAR
    // of headroom per 100 Tgas call even though far less is burned. 0.3 NEAR each, 25 guests = 7.5 NEAR from the parent.
    guestNear: opt("GUEST_NEAR", "0.3"),
    maxGuests: Number(opt("MAX_GUESTS", "25")),
    stateDir: path.join(REPO_ROOT, ".floor-state"),
    explorer: "https://explorer.testnet.near.org",
    evmRpcUrl: opt("EVM_RPC_URL", ""),
    evmPoolAddress: opt("EVM_POOL_ADDRESS", ""),
    evmExplorer: opt("EVM_EXPLORER", "https://sepolia.etherscan.io"),
  };
}
