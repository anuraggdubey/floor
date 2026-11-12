import { describe, expect, it } from "vitest";
import { askUnderwriter, parseDecision, BPS_MAX, BPS_MIN } from "../src/agent.js";

const market = { price_e8: 99_800_000, history_e8: [100_000_000, 99_900_000, 99_800_000], band_e8: 98_500_000 };
const req = { notional: 100_000_000n, tenor_secs: 300 };
const cfg = { apiKey: "k", model: "m", baseUrl: "http://x", timeoutMs: 500 };
const reply = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as unknown as typeof fetch;

describe("parseDecision", () => {
  it("parses a quote and clamps the rate", () => {
    expect(parseDecision('{"decision":"quote","bps":99999,"thought":"Vol is up."}')).toEqual({ quote: true, bps: BPS_MAX, thought: "Vol is up." });
    expect(parseDecision('{"decision":"quote","bps":1,"thought":"cheap"}')?.bps).toBe(BPS_MIN);
  });
  it("parses a refusal and ignores prose around the JSON", () => {
    expect(parseDecision('Sure! {"decision":"refuse","bps":0,"thought":"Too risky."} done')).toEqual({ quote: false, bps: 0, thought: "Too risky." });
  });
  it("rejects garbage, missing thought and unknown decisions", () => {
    expect(parseDecision("nope")).toBeNull();
    expect(parseDecision('{"decision":"quote","bps":100}')).toBeNull();
    expect(parseDecision('{"decision":"maybe","bps":100,"thought":"x"}')).toBeNull();
  });
});

describe("askUnderwriter", () => {
  it("returns a decision from the model", async () => {
    const d = await askUnderwriter(cfg, "volatility", market, req, 50_000_000n, reply('{"decision":"quote","bps":250,"thought":"Drifting down, widening."}'));
    expect(d?.quote).toBe(true);
    expect(d?.bps).toBe(250);
  });
  it("returns null on HTTP errors, bad output or unknown persona so the scripted strategy takes over", async () => {
    const bad = (async () => new Response("no", { status: 429 })) as unknown as typeof fetch;
    expect(await askUnderwriter(cfg, "volatility", market, req, 1n, bad)).toBeNull();
    expect(await askUnderwriter(cfg, "volatility", market, req, 1n, reply("blah"))).toBeNull();
    expect(await askUnderwriter(cfg, "ghost", market, req, 1n, reply("{}"))).toBeNull();
  });
  it("times out instead of hanging", async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("abort"))))) as unknown as typeof fetch;
    expect(await askUnderwriter({ ...cfg, timeoutMs: 30 }, "history", market, req, 1n, slow)).toBeNull();
  });
});
