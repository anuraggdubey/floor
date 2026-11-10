// Solver bots: turn an RFQ into signed quotes. Each bot is a scripted strategy with its own NEAR account,
// its own on-chain margin and its own ed25519 quote key. They read the live pool price, so quotes move.
import type { Chain } from "./chain.js";
import type { Cfg, SolverCfg } from "./config.js";
import { paramsHash, requiredMaxPayout, signQuote, type Params, type Quote } from "./quote.js";
import { STRATEGIES, type Market, type Strategy } from "./solvers.js";
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
}

export interface Declined {
  solver: string;
  name: string;
  reason: string;
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
  ) {}

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

    const offers: SignedOffer[] = [];
    const declined: Declined[] = [];
    for (const s of this.cfg.solvers) {
      const strat = STRATEGY_BY_KEY[s.strategy];
      const name = strat.name;
      if (gate && !gate.open) {
        declined.push({ solver: s.id, name, reason: gate.reason === "STALE_PRICE" ? "price feed stale" : "gate closed: peg under stress" });
        continue;
      }
      const offer = strat.quote(market, { notional, tenor_secs: tenorSecs });
      if (!offer) {
        declined.push({ solver: s.id, name, reason: "pulled out: pricing risk too high or size too large" });
        continue;
      }
      const sv = await this.chain.view<any>(this.cfg.floor, "get_solver", { account_id: s.id });
      const free = BigInt(sv?.free ?? "0");
      if (!sv?.active || free < maxPayout) {
        declined.push({ solver: s.id, name, reason: "no free margin for this size" });
        continue;
      }
      const quote: Quote = {
        rfq_id: rfqId,
        solver: s.id,
        holder,
        notional: notional.toString(),
        tenor_secs: tenorSecs,
        premium: offer.premium.toString(),
        max_payout: maxPayout.toString(),
        expires_ts: now + QUOTE_TTL_SECS,
        nonce: this.nextNonce(),
        params_hash: hash,
      };
      offers.push({
        solver: s.id,
        name,
        strategy: s.strategy,
        premium: quote.premium,
        max_payout: quote.max_payout,
        capacity: offer.capacity.toString(),
        expires_ts: quote.expires_ts,
        quote,
        signature: signQuote(quote, s.seed),
      });
    }
    offers.sort((a, b) => (BigInt(a.premium) < BigInt(b.premium) ? -1 : BigInt(a.premium) > BigInt(b.premium) ? 1 : 0));
    return { offers, declined, gate: gate ?? null, price_e8: price };
  }
}
