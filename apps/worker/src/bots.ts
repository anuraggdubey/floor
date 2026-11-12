// Solver bots: turn an RFQ into signed quotes. Each bot is a scripted strategy with its own NEAR account,
// its own on-chain margin and its own ed25519 quote key. They read the live pool price, so quotes move.
import type { Chain } from "./chain.js";
import type { Cfg, SolverCfg } from "./config.js";
import { paramsHash, requiredMaxPayout, signQuote, type Params, type Quote } from "./quote.js";
import { STRATEGIES, premiumFromBps, type Market, type Strategy } from "./solvers.js";
import { askUnderwriter, type AgentCfg } from "./agent.js";
import type { Bus } from "./events.js";
import type { PriceFeed } from "./prices.js";

export interface SignedOffer {
  solver: string;
  name: string;
  strategy: string;
  premium: string;
  max_payout: string;
  capacity: string;
  expires_ts: number;
  quote: Quote;
  signature: string;
  /** True when an LLM chose this premium; false for the scripted fallback. */
  ai: boolean;
  /** The underwriter's own reasoning, only present for AI offers. */
  thought: string | null;
  latency_ms: number | null;
}

export interface Declined {
  solver: string;
  name: string;
  reason: string;
  ai: boolean;
  thought: string | null;
}

const STRATEGY_BY_KEY: Record<SolverCfg["strategy"], Strategy> = {
  volatility: STRATEGIES[0]!,
  history: STRATEGIES[1]!,
  aggressive: STRATEGIES[2]!,
};

export const QUOTE_TTL_SECS = 60;

export class Bots {
  private seq = 0;
  private params?: Params;

  constructor(
    private chain: Chain,
    private cfg: Cfg,
    private feed: PriceFeed,
    private agent: AgentCfg | null = null,
    private bus: Bus | null = null,
  ) {}

  get aiEnabled(): boolean {
    return !!this.agent;
  }

  async getParams(): Promise<Params> {
    this.params ??= (await this.chain.view<Params>(this.cfg.floor, "get_params"))!;
    return this.params;
  }

  /** Nonces only need to be unique per solver; milliseconds plus a counter is monotonic and below 2^53. */
  private nextNonce(): number {
    this.seq = (this.seq + 1) % 1000;
    return Date.now() * 1000 + this.seq;
  }

  async quote(holder: string, notional: bigint, tenorSecs: number, rfqId: string) {
    const params = await this.getParams();
    const hash = paramsHash(params);
    const gate = this.feed.gate;
    const price = this.feed.latest?.price_e8 ?? 0;
    const market: Market = { price_e8: price, history_e8: this.feed.recentPrices(90), band_e8: params.band_e8 };
    const maxPayout = requiredMaxPayout(notional, params);
    const now = Math.floor(Date.now() / 1000);

    const request = { notional, tenor_secs: tenorSecs };
    const results = await Promise.all(
      this.cfg.solvers.map(async (s): Promise<{ offer?: SignedOffer; declined?: Declined }> => {
        const strat = STRATEGY_BY_KEY[s.strategy];
        const name = strat.name;
        const sv = await this.chain.view<any>(this.cfg.floor, "get_solver", { account_id: s.id });
        const free = BigInt(sv?.free ?? "0");
        const gateClosed = !!gate && !gate.open;
        const outOfBand = price < params.band_e8;

        // Ask the AI underwriter (if configured). It is consulted even when the gate is closed so it can say why it refuses.
        const ai = this.agent ? await askUnderwriter(this.agent, s.strategy, market, request, free) : null;
        const think = (decision: string, bps: number | null) =>
          ai &&
          this.bus?.emit("agent_thought", {
            rfq_id: rfqId,
            solver: s.id,
            name,
            decision,
            bps,
            thought: ai.thought,
            latency_ms: ai.latency_ms,
            price_e8: price,
          });

        if (gateClosed || outOfBand) {
          const reason = gate?.reason === "STALE_PRICE" ? "price feed stale" : "gate closed: peg under stress";
          think("refuse", null);
          return { declined: { solver: s.id, name, reason: ai ? ai.thought : reason, ai: !!ai, thought: ai?.thought ?? null } };
        }

        let premium: bigint;
        let capacity: bigint;
        if (ai) {
          if (!ai.quote) {
            think("refuse", null);
            return { declined: { solver: s.id, name, reason: ai.thought, ai: true, thought: ai.thought } };
          }
          premium = premiumFromBps(notional, ai.bps, tenorSecs);
          capacity = free;
          think("quote", ai.bps);
        } else {
          const offer = strat.quote(market, request);
          if (!offer) return { declined: { solver: s.id, name, reason: "pulled out: pricing risk too high or size too large", ai: false, thought: null } };
          premium = offer.premium;
          capacity = offer.capacity;
        }
        if (!sv?.active || free < maxPayout) {
          return { declined: { solver: s.id, name, reason: "no free margin for this size", ai: !!ai, thought: ai?.thought ?? null } };
        }
        const quote: Quote = {
          rfq_id: rfqId,
          solver: s.id,
          holder,
          notional: notional.toString(),
          tenor_secs: tenorSecs,
          premium: premium.toString(),
          max_payout: maxPayout.toString(),
          expires_ts: now + QUOTE_TTL_SECS,
          nonce: this.nextNonce(),
          params_hash: hash,
        };
        return {
          offer: {
            solver: s.id,
            name,
            strategy: s.strategy,
            premium: quote.premium,
            max_payout: quote.max_payout,
            capacity: capacity.toString(),
            expires_ts: quote.expires_ts,
            quote,
            signature: signQuote(quote, s.seed),
            ai: !!ai,
            thought: ai?.thought ?? null,
            latency_ms: ai?.latency_ms ?? null,
          },
        };
      }),
    );
    const offers: SignedOffer[] = results.flatMap((r) => (r.offer ? [r.offer] : []));
    const declined: Declined[] = results.flatMap((r) => (r.declined ? [r.declined] : []));
    offers.sort((a, b) => (BigInt(a.premium) < BigInt(b.premium) ? -1 : BigInt(a.premium) > BigInt(b.premium) ? 1 : 0));
    return { offers, declined, gate: gate ?? null, price_e8: price };
  }
}
