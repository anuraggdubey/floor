import { describe, expect, it } from "vitest";
import { isqrt, maxSwap, usdNeededToRestore } from "../src/arb.js";
import { deepestTier, planActions, type PolicyView } from "../src/keeper.js";
import { decrypt, encrypt } from "../src/guests.js";
import { parseEvents } from "../src/chain.js";
import { Bus } from "../src/events.js";
import { toBase } from "../src/server.js";

const pol = (o: Partial<PolicyView>): PolicyView => ({
  id: 1, holder: "h.testnet", solver: "s.testnet", notional: "100000000", premium: "5000000", max_payout: "15000000",
  created_ts: 1000, activate_ts: 1020, expires_ts: 1300, status: "Pending", tier_idx: null, payout_amount: "0", owed: "0", paying: false, ...o,
});

describe("arbitrage maths", () => {
  it("integer square root", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(10n ** 24n)).toBe(10n ** 12n);
  });
  it("restoring a dumped constant-product pool returns it to price 1.0", () => {
    // 1M/1M pool after 50k dUSD sold in: r_dusd = 1.05M, r_usd = ceil(1e24 / 1.05e12)
    const rDusd = 1_050_000_000_000n;
    const rUsd = (10n ** 24n + rDusd - 1n) / rDusd;
    const need = usdNeededToRestore(rUsd, rDusd);
    const newUsd = rUsd + need;
    const k = rUsd * rDusd;
    const newDusd = k / newUsd;
    const price = (newUsd * 100_000_000n) / newDusd;
    expect(price >= 99_999_000n && price <= 100_001_000n).toBe(true);
  });
  it("needs nothing when already at or above the peg", () => {
    expect(usdNeededToRestore(1_000_000_000_000n, 1_000_000_000_000n)).toBe(0n);
    expect(usdNeededToRestore(1_100_000_000_000n, 1_000_000_000_000n)).toBe(0n);
  });
  it("respects the pool's 20% swap cap", () => {
    expect(maxSwap(1_000_000_000_000n)).toBe(200_000_000_000n);
  });
});

describe("keeper planning", () => {
  it("activates a pending policy only after the wait", () => {
    expect(planActions([pol({})], [], 1019)).toEqual([]);
    expect(planActions([pol({})], [], 1020)).toEqual([{ kind: "activate", id: 1 }]);
  });
  it("triggers an active policy when a tier was sustained inside its window", () => {
    expect(planActions([pol({ status: "Active" })], [[1100, 0]], 1150)).toEqual([{ kind: "trigger", id: 1 }]);
  });
  it("waits for the settlement delay after the first sustained tier before triggering", () => {
    const active = [pol({ status: "Active" })];
    expect(planActions(active, [[1100, 0]], 1129, 30)).toEqual([]);
    expect(planActions(active, [[1100, 0]], 1130, 30)).toEqual([{ kind: "trigger", id: 1 }]);
    // a deeper tier sustaining later does not restart the clock
    expect(planActions(active, [[1100, 0], [1115, 2]], 1130, 30)).toEqual([{ kind: "trigger", id: 1 }]);
  });
  it("does not expire a policy that is still settling", () => {
    expect(planActions([pol({ status: "Active", expires_ts: 1300 })], [[1290, 0]], 1301, 30)).toEqual([]);
  });
  it("ignores a sustained breach from before activation or after expiry", () => {
    expect(planActions([pol({ status: "Active" })], [[1010, 2], [1400, 2]], 1150)).toEqual([]);
  });
  it("expires an active policy after its tenor when nothing was triggered", () => {
    expect(planActions([pol({ status: "Active" })], [], 1301)).toEqual([{ kind: "expire", id: 1 }]);
    expect(planActions([pol({ status: "Active" })], [], 1299)).toEqual([]);
  });
  it("prefers triggering over expiring when a breach was sustained", () => {
    expect(planActions([pol({ status: "Active" })], [[1200, 1]], 1400)).toEqual([{ kind: "trigger", id: 1 }]);
  });
  it("retries an owed refund or payout, but not while a transfer is in flight", () => {
    expect(planActions([pol({ status: "Triggered", owed: "3000000" })], [], 1500)).toEqual([{ kind: "pay", id: 1 }]);
    expect(planActions([pol({ status: "Void", owed: "5000000" })], [], 1500)).toEqual([{ kind: "pay", id: 1 }]);
    expect(planActions([pol({ status: "Triggered", owed: "3000000", paying: true })], [], 1500)).toEqual([]);
    expect(planActions([pol({ status: "PaidOut" }), pol({ id: 2, status: "Expired" })], [], 1500)).toEqual([]);
  });
  it("deepest tier picks the highest index in the window", () => {
    expect(deepestTier([[1100, 0], [1110, 2], [1120, 1]], 1020, 1300)).toBe(2);
    expect(deepestTier([], 0, 10)).toBeNull();
  });
});

describe("guest key encryption", () => {
  it("round-trips and rejects the wrong secret", () => {
    const blob = encrypt("ed25519:secretkey", "s3cret");
    expect(decrypt(blob, "s3cret")).toBe("ed25519:secretkey");
    expect(() => decrypt(blob, "wrong")).toThrow();
    expect(blob).not.toContain("secretkey");
  });
});

describe("chain event parsing", () => {
  it("extracts EVENT_JSON lines and ignores the rest", () => {
    const evs = parseEvents(["hello", 'EVENT_JSON:{"standard":"floor","event":"rejected","data":{"code":"GATE_CLOSED"}}', "EVENT_JSON:{bad"]);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.data.code).toBe("GATE_CLOSED");
  });
});

describe("amount parsing", () => {
  it("converts human amounts to 6-decimal base units", () => {
    expect(toBase("100")).toBe(100_000_000n);
    expect(toBase(1.5)).toBe(1_500_000n);
    expect(toBase("0.000001")).toBe(1n);
  });
  it("rejects junk", () => {
    expect(() => toBase("-1")).toThrow();
    expect(() => toBase("abc")).toThrow();
    expect(() => toBase("")).toThrow();
  });
});

describe("event bus", () => {
  it("replays recent stored events but not unstored ticks", () => {
    const b = new Bus(3);
    b.emit("price", {}, false);
    for (let i = 0; i < 5; i++) b.emit("x", { i });
    expect(b.recent.map((e) => e.data.i)).toEqual([2, 3, 4]);
  });
});
