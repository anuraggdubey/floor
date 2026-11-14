import { describe, expect, it } from "vitest";
import { Throttle, memoAsync } from "../src/throttle.js";
import { clientIp } from "../src/server.js";

describe("Throttle", () => {
  it("allows one call per window per key and says how long to wait", () => {
    let t = 1_000;
    const g = new Throttle(2000, () => t);
    expect(g.hit("a")).toBe(0);
    t += 500;
    expect(g.hit("a")).toBe(1500);
    expect(g.hit("b")).toBe(0); // other keys are independent
    t += 1500;
    expect(g.hit("a")).toBe(0);
  });
});

describe("memoAsync", () => {
  it("shares one in-flight call and reuses the value inside the window", async () => {
    let t = 0;
    let calls = 0;
    const read = memoAsync(
      async () => {
        calls++;
        return calls;
      },
      2000,
      () => t,
    );
    const [a, b] = await Promise.all([read(), read()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    t += 1000;
    expect(await read()).toBe(1);
    t += 1500;
    expect(await read()).toBe(2);
  });

  it("serves the last good value when a refresh fails, and throws when there never was one", async () => {
    let t = 0;
    let fail = true;
    const read = memoAsync(
      async () => {
        if (fail) throw new Error("rpc 429");
        return "ok";
      },
      1000,
      () => t,
    );
    await expect(read()).rejects.toThrow("rpc 429");
    fail = false;
    expect(await read()).toBe("ok");
    fail = true;
    t += 5000;
    expect(await read()).toBe("ok");
  });
});

describe("clientIp", () => {
  it("prefers the edge-set True-Client-IP over a client-supplied X-Forwarded-For", () => {
    expect(clientIp({ "true-client-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6, 203.0.113.9" }, "10.0.0.1")).toBe("203.0.113.9");
  });
  it("cannot be steered by garbage in the trusted header", () => {
    expect(clientIp({ "true-client-ip": "<script>", "x-forwarded-for": "198.51.100.4" }, "10.0.0.1")).toBe("198.51.100.4");
  });
  it("falls back to the socket address", () => {
    expect(clientIp({}, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp({})).toBe("unknown");
  });
});
