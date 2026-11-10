import { describe, expect, it } from "vitest";
import { paramsHash, paramsCanonical, publicKeyHex, quoteMessage, requiredMaxPayout, signQuote, verifyQuote, type Params, type Quote } from "../src/quote.js";

const DEMO: Params = {
  band_e8: 99_500_000,
  tiers: [
    { below_price_e8: 97_000_000, payout_bps: 300 },
    { below_price_e8: 93_000_000, payout_bps: 800 },
    { below_price_e8: 90_000_000, payout_bps: 1500 },
  ],
  sustain_secs: 30,
  lookback_secs: 120,
  wait_secs: 20,
  stale_secs: 60,
  max_tenor_secs: 600,
  exposure_cap: "1000000000000",
};

// Fixed vector shared with contracts/floor/src/tests.rs (`quote_message_is_stable`).
const Q: Quote = {
  rfq_id: "rfq-1",
  solver: "solver-a.testnet",
  holder: "holder.testnet",
  notional: "100000000",
  tenor_secs: 300,
  premium: "5000000",
  max_payout: "15000000",
  expires_ts: 1_700_000_060,
  nonce: 7,
  params_hash: "ab".repeat(32),
};

describe("quote canonical bytes", () => {
  it("matches the Rust contract's quote_message vector", () => {
    const s = new TextDecoder().decode(quoteMessage(Q));
    expect(s).toBe(
      `floor-quote/v1|rfq-1|solver-a.testnet|dUSD|holder.testnet|100000000|300|5000000|15000000|1700000060|7|${"ab".repeat(32)}`,
    );
  });

  it("signs and verifies, and rejects a tampered premium", () => {
    const seed = "07".repeat(32);
    const sig = signQuote(Q, seed);
    const pk = publicKeyHex(seed);
    expect(pk).toHaveLength(64);
    expect(verifyQuote(Q, sig, pk)).toBe(true);
    expect(verifyQuote({ ...Q, premium: "1" }, sig, pk)).toBe(false);
  });

  it("is deterministic: ed25519 signing has no randomness", () => {
    const seed = "07".repeat(32);
    expect(signQuote(Q, seed)).toBe(signQuote(Q, seed));
  });
});

describe("params hash", () => {
  it("canonical string matches Params::canonical in Rust", () => {
    expect(paramsCanonical(DEMO)).toBe("band:99500000|97000000:300|93000000:800|90000000:1500");
  });
  it("is 32-byte hex and changes when the tier schedule changes", () => {
    const h = paramsHash(DEMO);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(paramsHash({ ...DEMO, band_e8: 99_000_000 })).not.toBe(h);
  });
});

describe("max payout", () => {
  it("is notional times the deepest tier", () => {
    expect(requiredMaxPayout(100_000_000n, DEMO)).toBe(15_000_000n);
  });
});
