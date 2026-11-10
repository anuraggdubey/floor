// Canonical quote bytes and signing. Must match contracts/floor/src/types.rs `quote_message` byte for byte.
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

export interface Quote {
  rfq_id: string;
  solver: string;
  holder: string;
  /** All amounts are integer strings in fUSDC base units (6 decimals). */
  notional: string;
  tenor_secs: number;
  premium: string;
  max_payout: string;
  expires_ts: number;
  nonce: number;
  params_hash: string;
}

export interface Tier {
  below_price_e8: number;
  payout_bps: number;
}

export interface Params {
  band_e8: number;
  tiers: Tier[];
  sustain_secs: number;
  lookback_secs: number;
  wait_secs: number;
  stale_secs: number;
  max_tenor_secs: number;
  exposure_cap: string;
}

/** The exact string the contract hashes (`Params::canonical`). */
export function paramsCanonical(p: Pick<Params, "band_e8" | "tiers">): string {
  return `band:${p.band_e8}` + p.tiers.map((t) => `|${t.below_price_e8}:${t.payout_bps}`).join("");
}

export function paramsHash(p: Pick<Params, "band_e8" | "tiers">): string {
  return bytesToHex(sha256(utf8ToBytes(paramsCanonical(p))));
}

export function quoteMessage(q: Quote): Uint8Array {
  return utf8ToBytes(
    [
      "floor-quote/v1",
      q.rfq_id,
      q.solver,
      "dUSD",
      q.holder,
      q.notional,
      q.tenor_secs,
      q.premium,
      q.max_payout,
      q.expires_ts,
      q.nonce,
      q.params_hash,
    ].join("|"),
  );
}

export function publicKeyHex(seedHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(seedHex)));
}

export function signQuote(q: Quote, seedHex: string): string {
  return bytesToHex(ed25519.sign(quoteMessage(q), hexToBytes(seedHex)));
}

export function verifyQuote(q: Quote, sigHex: string, pubkeyHex: string): boolean {
  return ed25519.verify(hexToBytes(sigHex), quoteMessage(q), hexToBytes(pubkeyHex));
}

/** Maximum payout the contract requires a solver to commit to: notional * deepest tier bps / 10_000. */
export function requiredMaxPayout(notional: bigint, p: Pick<Params, "tiers">): bigint {
  const last = p.tiers[p.tiers.length - 1];
  if (!last) throw new Error("no tiers");
  return (notional * BigInt(last.payout_bps)) / 10_000n;
}
