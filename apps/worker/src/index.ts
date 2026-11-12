// Starts the whole worker: price feed, keeper, solver bots, arbitrage bot and the HTTP API.
import { Chain } from "./chain.js";
import { loadConfig } from "./config.js";
import { Bus } from "./events.js";
import { PriceFeed } from "./prices.js";
import { startKeeper } from "./keeper.js";
import { startArb } from "./arb.js";
import { Bots } from "./bots.js";
import { agentCfgFromEnv } from "./agent.js";
import { Guests } from "./guests.js";
import { startServer } from "./server.js";
import { startEvmExecutor } from "./evm.js";

const cfg = loadConfig();
const chain = new Chain(cfg);
const bus = new Bus();
const feed = new PriceFeed(chain, cfg, bus);
feed.start();
const keeper = startKeeper(chain, cfg, feed, bus);
const arb = startArb(chain, cfg, feed, bus);
const bots = new Bots(chain, cfg, feed, agentCfgFromEnv(), bus);
const guests = new Guests(chain, cfg);
startEvmExecutor(chain, cfg, bus);
startServer({ chain, cfg, bus, feed, bots, guests, keeper, arb });

bus.subscribe((ev) => {
  if (ev.kind === "price") return;
  console.log(`[${new Date(ev.ts).toISOString().slice(11, 19)}] ${ev.kind}`, JSON.stringify(ev.data).slice(0, 220));
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
