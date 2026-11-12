// AI underwriters. Each solver can be driven by an LLM (Groq, OpenAI-compatible API) that reads the live market,
// writes its reasoning in a few sentences, and either quotes a premium or refuses. The model only chooses a
// premium rate; everything that moves money is unchanged: the rate is clamped to hard bounds here, the solver's
// ed25519 key signs the quote, and the Floor contract verifies the signature and locks the solver's margin.
// If there is no key, the call times out or the answer is unusable, the scripted strategy answers instead and
// the offer is labelled scripted.
import { deviationBps, worstDeviationBps, type Market, type Request } from "./solvers.js";

export interface AgentCfg {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface Persona {
  name: string;
  style: string;
}

export const PERSONAS: Record<string, Persona> = {
  volatility: {
    name: "Volatility",
    style:
      "You are a quantitative risk underwriter. You price strictly off realised volatility: the worst recent peg deviation is your main input. You widen fast when the market moves and refuse when it looks like a depeg is under way.",
  },
  history: {
    name: "History",
    style:
      "You are a conservative actuary. You anchor on a long-run base rate of stablecoin depegs (rare, but fat-tailed, e.g. USDC at $0.87 in March 2023). You quote steady premiums, widen only on clear drift, and refuse when the price is more than 1.5% off the peg.",
  },
  aggressive: {
    name: "Aggressive",
    style:
      "You are an aggressive, capital-light underwriter who wants market share. You quote the cheapest premium to win the order, but you run away at the first sign of stress and you refuse large sizes.",
  },
};

export interface AgentDecision {
  quote: boolean;
  /** Premium in basis points of notional per 5 minutes of tenor. */
  bps: number;
  thought: string;
  latency_ms: number;
}

export const BPS_MIN = 40;
export const BPS_MAX = 2000;

export function agentCfgFromEnv(env: NodeJS.ProcessEnv = process.env): AgentCfg | null {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
    baseUrl: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    timeoutMs: Number(env.GROQ_TIMEOUT_MS || 7000),
  };
}

function summarise(m: Market, r: Request, freeMargin: bigint): string {
  const dev = deviationBps(m.price_e8);
  const worst = worstDeviationBps(m.history_e8);
  const h = m.history_e8;
  const step = Math.max(1, Math.floor(h.length / 12));
  const sampled = h.filter((_, i) => i % step === 0 || i === h.length - 1).map((p) => (p / 1e8).toFixed(4));
  const trend = h.length > 1 ? (h[h.length - 1]! - h[0]!) / 1e8 : 0;
  return [
    `Peg price now: $${(m.price_e8 / 1e8).toFixed(4)} (deviation ${dev} bps below $1.00).`,
    `Worst deviation in the last ~90 samples: ${worst} bps. Net move over that window: ${trend >= 0 ? "+" : ""}${trend.toFixed(4)}.`,
    `Recent prices (oldest to newest): ${sampled.join(", ")}.`,
    `Cover gate refuses purchases below $${(m.band_e8 / 1e8).toFixed(4)}.`,
    `Request: ${Number(r.notional) / 1e6} fUSDC notional, tenor ${r.tenor_secs}s. If the price stays below a tier line for the sustain window you pay the holder up to ~15% of notional out of your own locked margin.`,
    `Your free margin: ${Number(freeMargin) / 1e6} fUSDC.`,
  ].join("\n");
}

const SYSTEM = `You underwrite stablecoin depeg cover on a live market. Reply with ONE JSON object and nothing else:
{"decision":"quote"|"refuse","bps":<integer>,"thought":"<1-2 plain sentences, max 220 characters, first person, say WHY>"}
"bps" is your premium in basis points of notional per 5 minutes of tenor. Typical range 60-600; go higher when risk is higher. Never exceed ${BPS_MAX}. If you refuse, set bps to 0. Do not use markdown.`;

/** Pure: pulls a decision out of a model reply; returns null when it cannot be trusted. */
export function parseDecision(text: string): { quote: boolean; bps: number; thought: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let j: any;
  try {
    j = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const decision = String(j.decision ?? "").toLowerCase();
  if (decision !== "quote" && decision !== "refuse") return null;
  const thought = String(j.thought ?? "").replace(/\s+/g, " ").trim().slice(0, 260);
  if (!thought) return null;
  if (decision === "refuse") return { quote: false, bps: 0, thought };
  const bps = Math.round(Number(j.bps));
  if (!Number.isFinite(bps)) return null;
  return { quote: true, bps: Math.min(BPS_MAX, Math.max(BPS_MIN, bps)), thought };
}

/** Asks the model for a decision. Returns null on any failure so the caller can fall back to the scripted strategy. */
export async function askUnderwriter(
  cfg: AgentCfg,
  strategyKey: string,
  m: Market,
  r: Request,
  freeMargin: bigint,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentDecision | null> {
  const persona = PERSONAS[strategyKey];
  if (!persona) return null;
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${persona.style}\n\n${SYSTEM}` },
          { role: "user", content: summarise(m, r, freeMargin) },
        ],
      }),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    const parsed = parseDecision(String(body?.choices?.[0]?.message?.content ?? ""));
    if (!parsed) return null;
    return { ...parsed, latency_ms: Date.now() - t0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
