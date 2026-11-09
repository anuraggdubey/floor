# NEAR HACKATHON 2026: Full Agent Brief

> Compiled 2026-11-09 from nearhackathon.com, nearhackathon.com/HACKATHON.md, nearhackathon.com/request-changes, and the official repo github.com/nearai/near-hackathon-prompt-examples (README, 00-setup.md, SUBMITTING.md, all 13 track files).
> The live HACKATHON.md is the source of truth. Re-read https://nearhackathon.com/HACKATHON.md before submitting: dates and rules may change.
> All times UTC. India (IST) = UTC+5:30.

---

## 0. TL;DR

- Fully online, 2-week build competition on the NEAR ecosystem. **No sign-up.** The final submission is the only registration.
- **Window:** 1 Nov 2026 00:00 UTC to **14 Nov 2026 23:59 UTC** (= 15 Nov 05:29 IST).
- **Prize pool: $250,000**, paid in NEAR. 1 grand prize ($55K) + 13 tracks x (1st $10K / 2nd $3K / 3rd $2K).
- Deliverables: (1) **public GitHub repo**, (2) **public demo post on X** (tag @NEARProtocol + #NEARHackathon, video or screenshots attached), (3) one submission via form or API with both links.
- Judging: Claude Code + Codex screen every project first (does it run, does it match the README). Then human judges decide.
- One submission per project. One person can enter max 2 *different, independent* projects (each README must name the other).

---

## 1. Event facts

| Item | Value |
|---|---|
| Name | NEAR HACKATHON ("Build what's next" / "Build Beyond Boundaries") |
| Organizer | NEAR Protocol / NEAR Foundation ecosystem (AI: nearai) |
| Format | Fully online |
| Announced | 2026-10-19 (https://x.com/nearprotocol/status/2112257967818997891) |
| Starts | 2026-11-01T00:00:00Z |
| Development ends / submission deadline | **2026-11-14T23:59:00Z** |
| Judging | 2026-11-16T00:00:00Z to 2026-11-18 |
| Results announced by | 2026-11-18T23:59:00Z |
| Payout | Single payment, no vesting, **within 30 days of results**, to the NEAR account given in the submission |
| Entry fee | None mentioned. No sign-up. |
| Eligibility | Developers, designers and people with ideas for the NEAR ecosystem. Solo or team. No country restriction listed. |
| Submissions open | 1 Nov 2026 00:00 UTC |
| Tagline themes | "Programmable money", "Autonomous payments. Intelligent agents. Money with a mind of its own." Marquee: BUILD WITHOUT PERMISSION / THINK BEYOND THE CHAIN / MAKE YOUR SIGNAL MATTER |
| Meta focus | Privacy, intents, AI, digital ownership |

Side events (reported by press, not on the main site): in-person meetups in Chicago, Bolivia, Malaysia, NYC in November. Devrels are on standby in NEAR Discord.

---

## 2. Prize pool

Amounts fixed in USD, **paid in NEAR**.

| Prize | Amount | Count | Total |
|---|---|---|---|
| Grand prize (one overall) | $55,000 | 1 | $55,000 |
| 1st place per track | $10,000 | 13 | $130,000 |
| 2nd place per track | $3,000 | 13 | $39,000 |
| 3rd place per track | $2,000 | 13 | $26,000 |
| **Total** | | | **$250,000** |

Implications:
- Max single-track win = $10K. Grand prize on top of that = $55K.
- Picking **every track your project honestly fits** costs nothing (still one submission) and widens the shot at placing.
- Organizers keep no rights to your code; they get non-exclusive promo rights (see Rules, Q-013).

---

## 3. The 13 tracks

Select every track the project fits. It's still one submission. IDs go in the `tracks` array.

Notes on the "hints": organizers say hints, named protocols and example prompts are **wishes, not requirements** (Q-011). No mandatory integration. A custom NEAR contract that fits the track is enough. Name the NEAR features you used in the README so judges see how they power the project.

### 01. Unstoppable DeFi (`defi`), "Markets that never close"
- **Build:** exchanges, perps, lending, vaults, trading agents that settle cross-chain through NEAR Intents. Deep liquidity, no custodian, nobody to switch it off.
- **Lean on:** trading, NEAR Intents, Chain Signatures.
- **Starter idea:** cross-chain DCA vault. User deposits USDC from any Intents-supported chain, picks BTC/ETH/NEAR and a schedule. Each interval: get a 1Click API quote, reject if slippage exceeds the user's limit, execute so the asset lands in the user's own address on the target chain.
- **Starter requirements:** use near-intents skill + 1Click API for quotes/deposits/status; handle REFUNDED and FAILED statuses in UI; show where funds sit at every step; small web UI (deposit, schedule, buy history with explorer links); **dry-run mode** fetching real quotes without executing so judges can try with no funds; stretch: NEAR contract owns the vault and controls a derived BTC address via Chain Signatures.
- **Resources:** 1Click API quickstart (docs.near-intents.org/integration/distribution-channels/1click-api/quickstart), Chain Signatures getting started (docs.near.org/chain-abstraction/chain-signatures/getting-started), Rhea guide (guide.rhea.finance), Agent API overview (docs.agentsonintents.com/integration/agent-api/overview), Aurora Intents.
- **Partner notes:** Rhea = NEAR DEX + lending (CLMM/AMM pools, cross-chain swap API, vaults on lending). SDK docs github.com/rhea-finance/rhea-sdk-docs; CLI guide.rhea.finance/developers-1/cli-trading.

### 02. Investment Thesis (`thesis`), "Make the long-term case"
- **Build:** a long-term investment thesis for NEAR backed by onchain analytics, live dashboards, models anyone can re-run. **Judged on the evidence, not the conviction.** The score depends on evidence someone else can reproduce.
- **Lean on:** onchain data, dashboards, research.
- **Starter idea:** test whether cross-chain volume via NEAR Intents is a better leading indicator of real network usage than token price. Report everything, including evidence against.
- **Starter requirements:** SQL on NEAR BigQuery public dataset `bigquery-public-data.crypto_near_mainnet_us` (daily active accounts, tx counts, contract usage; **always filter on block_date** to control cost); pull swap volume from NEAR Intents Explorer API (needs a JWT from partner dashboard, in .env); one command rebuilds all charts from raw data; static dashboard (each chart + its query + one plain sentence); THESIS.md with claim, evidence for, evidence against, what would change the author's mind. **Never invent numbers**; if a metric can't be computed, say so.
- **Note:** NEAR pays for dataset storage; you pay normal BigQuery query costs.
- **Resources:** docs.near.org/data-infrastructure/big-query, .../what-is, Intents Explorer API docs.

### 03. Privacy & Private AI (`privacy`), "Private by design"
- **Build:** confidential computation, private finance, AI that protects sensitive data. Intelligence without exposure.
- **Lean on:** private AI, TEE, NEAR AI Cloud.
- **Starter idea:** private expense auditor. User uploads receipts/bank statement; a model on NEAR AI Cloud categorizes and flags anomalies; app proves the analysis ran in a TEE.
- **Starter requirements:** call NEAR AI Cloud via OpenAI-compatible API (base URL `https://cloud-api.near.ai/v1`, key in .env), pick a TEE-hosted model from the models endpoint; fetch attestation report with a **fresh random nonce** and verify per verification docs; show a "Verified" panel listing checks; keep nothing server-side after response (say so in README, obvious in code); ship fictional sample docs so judges can run without real data; use near-ai-cloud agent skill; start with a minimal script (one completion + attestation verify) before the UI.
- **Resources:** docs.near.ai/cloud/quickstart, docs.near.ai/cloud/verification, github.com/near-examples/nearai-cloud-verification-example. NEAR AI credits: see Q-000.

### 04. Autonomous Business (`business`), "The company of one. Or none"
- **Build:** AI-native businesses with treasury, sales, procurement, cross-chain payments via NEAR Intents, revenue sharing. Humans only set constraints.
- **Lean on:** AI agents, NEAR Intents, Chain Signatures.
- **Starter idea:** one-agent research shop selling short market reports. Customers pay in any token via Intents; agent buys its own inference from NEAR AI Cloud; fixed share of each sale goes to a contributors' account automatically.
- **Starter requirements:** a config.yaml the owner controls (max daily inference spend, min report price, revenue split %, **kill switch**); agent has its own NEAR account; **never store a full-access key in plaintext** (use OutLayer agent custody or a scoped function-call key); public ledger page of every sale/cost/payout; demo mode running one full sale-to-payout loop on testnet in **under two minutes**.
- **Resources:** docs.near.org/ai/introduction, OutLayer (app.outlayer.ai/docs/getting-started), 1Click API, Agent API overview, PingPay Agent Pay facilitator.

### 05. AI Swarms (`swarms`), "Many agents. One economy"
- **Build:** coordination markets, bidding, collective purchasing, intent-based settlement, emergent economies between agents.
- **Lean on:** multi-agent systems, NEAR Intents, sub-accounts.
- **Starter idea:** group-buying swarm. Buyer agents (each for one user wanting e.g. GPU hours) find each other, pool demand, run a sealed-bid round against seller agents; winning bid settles via Intents; each buyer pays only its share.
- **Starter requirements:** each agent has its own **sub-account** under one parent (e.g. buyer-1.swarm.testnet) so every action traces to an agent; coordinator contract/service opens rounds, collects sealed bids, reveals, picks winner; **write RULES.md before code**; **simulation mode** with 20 buyers + 5 sellers on scripted strategies (no LLM calls); live page showing rounds, bids, clearing price, allocations.
- **Resources:** docs.near-intents.org/getting-started/what-are-intents, docs.near.org/getting-started/tools-for-ai, github.com/nearai/near-mcp, nearaccounts.com (Top Level Accounts), Agent API overview.

### 06. AI Security & Defense (`security`), "Trust, but verify"
- **Build:** spending limits, policy engines, sandboxed wallets, reputation, scam detection. Give AI money without giving it the keys to everything.
- **Lean on:** agent security, function-call keys, TEE attestation.
- **Starter idea:** counterparty check for paying agents. Before an agent sends funds/calls a contract, it asks this service about the receiver; service returns allow / warn / block + reasons.
- **Signals:** account age & activity; is it a contract and did its code change recently; prior interactions between this agent and receiver; shared blocklist other agents can report to, with evidence.
- **Starter requirements:** agent-side wrapper that refuses to sign on `block` and asks a human on `warn`; agent signs with a **function-call access key scoped to one contract, never full-access** (explain the key's limits in README); **attack demo script** where a prompt-injected agent tries to pay a known-bad address and is stopped, with the log shown.
- **Gotcha (from the repo):** a function-call-key-only account can't transfer NEAR or add keys, and can lock itself out if its gas allowance runs out.
- **Resources:** docs.near.org/protocol/accounts-contracts/access-keys, OutLayer, NEAR AI Cloud verification, Agent API policies & limits.

### 07. Agent Economy (`agents`), "Give AI a wallet"
- **Build:** agents that earn, spend, negotiate, hire other agents, pay for APIs/compute/data, with crypto directly or via Intents.
- **Lean on:** agent commerce, NEAR Intents, Chain Signatures.
- **Starter idea:** general contractor agent. Given a task + budget: splits the task, decides do-vs-buy, hires agents or buys data, checks the work, pays out, stays inside budget.
- **Starter requirements:** investigate NEAR AI Agent Market (market.near.ai) to see how jobs are posted/paid programmatically (tell the human if there's no public way before building around it); **negotiation** (if a quote exceeds plan, counter once with reasoning, then accept or walk); payments in USDC or NEAR, direct or via Intents; a **receipt per task** (what, from whom, price, whether work passed the check); explain how the agent holds keys and what it can't do without the human.
- **Notes:** Agent API gives each agent a policy-bound wallet; demo base URL `https://api.demo.agentsonintents.com` (demo keys temporary, rotate after demo period; create in partner dashboard). PingPay Agent Pay facilitator lets agents pay HTTP 402 (x402) paywalls in USDC on Base, settling to a NEAR recipient via Intents.
- **Agent Market partner note:** list your agent so it can earn (docs.market.near.ai/list-your-agent); hire agents from Claude/MCP clients (docs.market.near.ai/guides/claude-desktop).

### 08. Real-World Money (`realworld`), "Bring the boring money onchain"
- **Build:** payroll, invoicing, remittances, merchant payments, stablecoin rails for real businesses. **"Something a normal company could use tomorrow."**
- **Lean on:** stablecoins, NEAR Intents, meta transactions.
- **Starter idea:** crypto invoicing for freelancers who don't care about crypto. Freelancer makes an invoice link; client pays from any chain/token; freelancer receives USDC on NEAR and never buys NEAR for gas.
- **Starter requirements:** invoice page (amount, due date, line items, pay button) paying via 1Click API; **gasless** via a meta-transaction relayer that only pays for calls to your own contract; trustworthy status (paid/pending/refunded + tx links); CSV export an accountant can open without questions; **write the README first as if a bookkeeper will read it**; build one full paid-invoice flow on testnet first.
- **Resources:** 1Click quickstart, docs.near.org/web3-apps/tutorials/meta-transactions, NEP-141 (github.com/near/NEPs/blob/master/neps/nep-0141.md), PingPay.
- **Partner note:** NEAR Business (business.near.com) = confidential multisig on Intents, hides balances/transfers, 35+ chains, approval policies.

### 09. Games With Real Economies (`games`), "The economy is the gameplay"
- **Build:** NPCs with wallets, player-owned markets, economies that evolve without a dev patch. **Judged on the game loop, not the token. Bonus if players never notice the chain.**
- **Lean on:** agent NPCs, social login, NEAR Intents, NEP-245.
- **Starter idea:** market-town game. Players gather materials and trade with NPC merchants; each merchant is an agent with own wallet + inventory, prices from stock and recent demand (flood the market with iron and iron gets cheap; a broke merchant closes until someone invests).
- **Starter requirements:** items are **NEP-245 multi tokens** (one contract for all item types); **social/email login, no seed phrases, no wallet popups, no gas prompts** in the normal loop; merchant pricing rules in one readable file with reasoning shown in a tooltip; **fast-forward mode** simulating a week of trading in a minute; design the game loop on paper first (every 30 sec, 5 min, session).
- **Resources:** NEP-245 (github.com/near/NEPs/blob/master/neps/nep-0245.md), near-dapp agent skill (github.com/near/agent-skills/tree/main/skills/near-dapp), What are intents.

### 10. NFTs That Do Something (`nfts`), "What comes after the JPEG"
- **Build:** NFTs as accounts: assets that own money, earn royalties, hold inventory, carry credentials/memberships/access rights. Ownership with behavior.
- **Lean on:** dynamic NFTs, NEP-171, sub-accounts.
- **Starter idea:** membership NFT that carries its own wallet. Each NFT maps to a sub-account holding a share of the club treasury and a cut of ticket sales; whoever holds the NFT controls the sub-account; sell it and wallet, balance, access all move.
- **Starter requirements:** NEP-171 contract + token-to-sub-account logic; **README explains exactly how control passes on transfer and what stops the old owner keeping access**; gated page for current holders only; per-NFT history (earned, paid out, holders); **tests for transfer path including a sale in the middle of a payout**; write the **threat model** of every way a seller could keep the money before coding.
- **Note:** in the Top Level Accounts (TLA) system a rented name is a NEP-171 NFT that is also a real NEAR account. No SDK yet; build on the live, audited mainnet contracts directly (github.com/houseofstake/tla-contracts; sharded NFT items draft in its docs).
- **Resources:** NEP-171, access keys, near-smart-contracts agent skill.

### 11. Memecoins With Mechanics (`memecoins`), "The joke needs rules"
- **Build:** memecoins where the meme does something: supply reacting to the community, treasuries with rules, onchain rituals/challenges. **Judged on the mechanic, not the chart.** Price chart doesn't count.
- **Lean on:** memecoins, token mechanics, NEP-141.
- **Starter idea:** streak coin. Holders check in once daily; if the community hits the daily target, each checker-in gets a small mint; if missed, a slice of treasury burns and the streak resets; longest streak shown like a high score.
- **Starter requirements:** NEP-141 token with the mechanic **in the contract**, not a backend someone could switch off; all parameters (target, mint size, burn size) fixed at launch, publicly readable, **no admin key that can change them later**; demo-grade sybil resistance with limits stated plainly in README; page with streak, today's progress, log of every mint/burn; **simulate 60 days of community behavior first** and show supply curves under several scenarios, then pick parameters.
- **Resources:** NEP-141, meme.cooking (launchpad partner), near-smart-contracts skill. Partner BRRRAIN = memecoin with AI rewards.

### 12. Social Money (`social`), "Coordinate value together"
- **Build:** shared budgets, programmable rewards, collective ownership, reputation-based access **on top of Sputnik DAO and Trezu**. **Don't rebuild the multisig. Build what communities do with it.**
- **Lean on:** Sputnik DAO, Trezu, named accounts.
- **Starter idea:** bounty board with earned trust for a community already running treasury on Sputnik DAO or Trezu. Members post bounties, contributors claim/finish, payouts from treasury; good track record raises how much can be paid without a full council vote.
- **Starter requirements:** use existing DAO/Trezu treasury for custody and approvals; reputation tied to named accounts, every point traceable to a finished bounty; tiers: small = auto-approve for trusted contributors, mid = one council member, large = normal DAO proposal; public board (open bounties, claims, payouts, contributor records). Read the Sputnik contract and Trezu docs first and state which approval flows exist vs need adding.
- **near.social gotcha:** posts/replies/follows are writes to the `social` account; the tx always shows as failed (`CodeDoesNotExist`) because that account has no contract. Expected. Data still lands; verify via `GET https://api2.near.social/v1/tx/{tx_hash}`.
- **Resources:** github.com/near-daos/sputnik-dao-contract, Trezu docs (github.com/NEAR-DevHub/trezu-docs) and repo (github.com/NEAR-DevHub/trezu), near.social, its agent guide near.social/skill.md, nearaccounts.com.

### 13. Open Innovation (`open`), "Something we haven't seen"
- **Build:** ideas that refuse a category. New ways for money, intelligence and ownership to work together. Can be entered alongside any other track.
- **Lean on:** experimental, chain abstraction, build your own.
- **Starter idea:** inheritance account. One NEAR account controls the owner's BTC and ETH addresses via Chain Signatures; owner checks in on a schedule; after N (e.g. 90) missed days guardians can approve release to named heirs after a waiting period the owner can still cancel.
- **Starter requirements:** release rules in a public contract; owner can cancel any pending release until the waiting period ends; testnet demo with timers shortened to minutes; README section on failure cases (lost guardian keys, hostile guardian, owner alive but offline). Prompt also tells the agent to **argue against the idea for a paragraph first**.
- **Resources:** Chain Signatures getting started, docs.near.org, HACKATHON.md.

> Every starter prompt ends with a **checkpoint where the agent stops and waits for the human** (propose layout/threat model/RULES.md, then wait for OK).

---

## 4. Judging

### Process
1. **AI screening (Claude Code & Codex, listed as judges: "Anthropic & OpenAI")** reviews *every* project first: reproducibility check (does it run), feature verification (does it do what the README says), structured report, preliminary score.
2. **Human judges make the decisions.** A low AI score alone **cannot reject** a project (Q-017).
3. Judging window 16 to 18 Nov; results by 18 Nov 23:59 UTC.

### Human judges (from the site)
| # | Judge | Affiliation | X |
|---|---|---|---|
| 1 | Illia Polosukhin | NEAR Protocol | @ilblackdragon |
| 2 | Eddy Lazzarin | a16z crypto | @eddylazzarin |
| 3 | Mert Mumtaz | Helius | @0xMert_ |
| 4 | Avichal Garg | Electric Capital | @avichal |
| 5 | Kain Warwick | Synthetix & Infinex | @kain |
| 6 | Haseeb Qureshi | Dragonfly | @hosseeb |
| 7 | Stepan Gershuni | cyber•Fund | @cyntro_py |
| 8 | Claude Code & Codex | Anthropic & OpenAI | @claudeai, @OpenAI |

### Criteria
**There is no published official scoring rubric or weights.** What the organizers state:
- Previous NEAR hackathons evaluated: **technical implementation, design, impact, originality, sustainability.** The site calls this "a good guide to prepare by."
- Per-track signals from track copy:
  - Thesis: evidence someone else can reproduce; "judged on the evidence, not the conviction."
  - Games: the game loop; bonus if players never notice the chain.
  - Memecoins: the mechanic, not the chart.
  - Real-World Money: could a normal company use it tomorrow.
  - Social: build on the DAO/multisig, don't rebuild it.
- Machine-reader focus: README must work for an AI judge: what it is, the problem, **numbered "do X, see Y" steps**, no marketing.

---

## 5. Rules (official Q&A, Q-000 to Q-017, from HACKATHON.md)

- **Q-000 NEAR AI credits?** Buy with crypto/card in the NEAR AI Cloud dashboard (https://cloud.near.ai), or **claim $10 by joining NEAR Builders** (https://nearbuilders.org/join). Generate the API key in the dashboard.
- **Q-001 Code before Nov 1?** Code written **since the announcement on 2026-10-19** counts. Window = 10/19 to 11/14. Earlier commits are baseline.
- **Q-002 Existing product on another chain?** Allowed. **Only the NEAR integration built in the window is judged.** Disclose in README.
- **Q-003 New repo required?** No. Use a dedicated branch, or tags `pre-hackathon` and `hackathon-submission`, plus a README section linking the diff.
- **Q-004 Old project / new feature?** Old project as-is: **no**. New feature built in the window: **yes**, if separated per Q-003. No minimum code size.
- **Q-005 Libraries/templates/boilerplate/AI code?** All allowed. List in README; own old libs count as baseline.
- **Q-006 1Click JWT?** Not required. Without it there's a **0.2% fee**. Register at https://partners.near-intents.org.
- **Q-007 Testnet for Intents?** **None exists or is planned.** Use mainnet, separate dev accounts, tiny amounts, `dry: true` quotes.
- **Q-008 Test funds?** Testnet NEAR is free (near-cli faucet, near-faucet.io). Mainnet costs are not reimbursed by default.
- **Q-009 RPC/hosting?** Public RPC free: https://docs.near.org/api/rpc/providers
- **Q-010 Testnet-only eligible?** **Yes, all tracks.** Mainnet only where the integration is mainnet-only.
- **Q-011 Mandatory integrations?** **None.** Hints are hints. Own NEAR contract that fits the track is enough.
- **Q-012 Local-only demo OK?** Yes: public repo + reproducible README + X post **with a video**. **Screenshots alone are not enough when judges cannot open the demo.** Hosted demo is a plus; keep it up through 2026-11-18, ideally 2026-11-25.
- **Q-013 Organizer rights to code?** None. Team keeps all rights; organizers get **non-exclusive promo rights** to name, screenshots, video, repo link.
- **Q-014 License?** Any. MIT is fine. Repo stays public through judging. **Add a LICENSE file.**
- **Q-015 One person, several projects?** Allowed if independent and disclosed (each README names the other). Not the same project twice. **Max 2 different projects per person.**
- **Q-016 Payout?** Single payment, no vesting, within 30 days of results.
- **Q-017 Claude Code & Codex role?** Screening, not deciding (see Judging).

Other rules/constraints:
- Submissions accepted **only 2026-11-01T00:00Z to 2026-11-14T23:59Z.** Outside the window the API returns 403.
- Repo may be private while building but **must be public by the deadline.** Judges can't open private repos.
- **Each repository can be submitted only once** (409 otherwise).
- **No keys/secrets anywhere in the repo history** (checklist item). Keys in env vars / .env.
- Payout account must be a **mainnet NEAR account** (named like `team.near` or a 64-char implicit account). Team creates it in any NEAR wallet.
- No wallet connection needed to submit.

---

## 6. Submission requirements

### Four stages (site): Assemble, Build, Show it, Submit
1. **Build** the project (team or solo). Code since the announcement counts.
2. **Publish the repository** (public).
3. **Post the demo on X.** Must: say it was **built at NEAR HACKATHON**, tag **@NEARProtocol** and **#NEARHackathon**, attach **demo video or screenshots**. Optional extra tags: @NearLegion, @NearBuilders (more amplification).
4. **Submit** repo link + demo post link. **Both required.**

### What a good demo post does (HACKATHON.md)
- Lead with the user problem; first line understandable to a stranger.
- Show **one complete moment**: real user action to visible result. Skip long intros, architecture slides, setup.
- Explain NEAR's role **concretely** (cross-chain settlement, private inference, agent-controlled spending, etc.), not a vague "powered by NEAR."
- Give a next step: link demo + public repo, ask a genuine question/invite specific feedback.
- The agent may draft the text; **the human posts it** and supplies the link.

### Form fields (website) / API contract
`POST https://nearhackathon.com/api/applications`, `Content-Type: application/json`, body max **12000 bytes**. Send exactly these fields:

| Field | Type | Rule |
|---|---|---|
| requestId | string | UUID, generated **once** per submission, reused on retries (generate with `uuidgen` lowercased, or `node -e 'console.log(crypto.randomUUID())'`) |
| projectName | string | 2-80 chars |
| leadName | string | 2-80 chars |
| email | string | valid, max 160 chars, **max 2 submissions per email** |
| size | string | exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` (note the spaces around the dash; ranges overlap at 4/6, pick the one that fits) |
| tracks | string[] | one or more of: `defi`, `thesis`, `privacy`, `business`, `swarms`, `security`, `agents`, `realworld`, `games`, `nfts`, `memecoins`, `social`, `open`; each once |
| nearAddress | string | 2-64 chars, lowercase, regex `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$` |
| projectUrl | string | http(s) URL of the **public repo**, max 300 chars, **unique** |
| demoUrl | string | http(s) URL of the **public X demo post**, max 300 chars |
| idea | string | 20-2000 chars: problem, product, how NEAR fits |
| consent | boolean | `true` only after the human agreed to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

**Do not add other fields.** `website` is a spam trap: any non-empty value rejects the submission. The form also has an optional "Website" field in the UI, which must be left empty.

| Status | Meaning | Action |
|---|---|---|
| 201 | Saved | Done, tell the human |
| 400 | Field validation failed | Fix fields listed in `fields`, resend with the **same requestId** |
| 403 | Not open, or cross-site request | Tell the human. Don't retry |
| 409 | Repo already submitted, or email hit 2-submission limit | Ask the human. Never change link/email to dodge it |
| 413 | Body too large | Shorten description |
| 503 | Storage unavailable | Wait a minute, resend with the same requestId |

### Pre-submit checklist (official SUBMITTING.md)
- [ ] Repo is public; README has "do X, see Y" steps an AI judge can follow
- [ ] Demo post is live on X, says built at NEAR HACKATHON, has video or screenshots
- [ ] Mainnet NEAR account ready for payout (own or team's)
- [ ] Every fitting track selected
- [ ] No keys/secrets anywhere in repo history
- [ ] Submitting before 2026-11-14 23:59 UTC

### Editing a submission (request-changes)
**Discrepancy to know about:** SUBMITTING.md says "you can't edit it after you send it", but the website and HACKATHON.md provide a hand-reviewed change process. Treat submission as one-shot, but corrections are possible:
- Page: https://nearhackathon.com/request-changes
- Enter email, NEAR wallet and repo link **exactly as submitted** (best recollection if the mistake is in one of those).
- Tick every field to change (Project name, Team lead, Email, Team size, Tracks, NEAR wallet, Repo link, Demo post link, What did you build, Anything else) and give new values.
- Leave a Discord or Telegram handle (required) and consent.
- Organizers review **by hand**, may message to confirm (especially wallet/repo changes). Until applied, the submission stays as-is.
- **Never re-submit** (409; a different link would count as a different project).

---

## 7. Instructions for the AI coding agent (distilled from HACKATHON.md + 00-setup.md)

### Setup prompt to run once (official 00-setup.md, paraphrased)
1. Read https://nearhackathon.com/HACKATHON.md in full; obey its "never without confirmation" list.
2. Install NEAR agent skills: `npx skills add near/agent-skills` (skills: `near-ai-cloud`, `near-api-js`, `near-dapp`, `near-intents`, `near-kit`, `near-smart-contracts`; one only: `--skill <name>`).
3. Use https://docs.near.org/llms.txt and https://docs.near-intents.org/llms.txt to locate docs. **Look up contract addresses, endpoints, SDK versions in docs; never guess them.**
4. Build on **testnet first**. Keys in .env, never in the repo.
5. README from day one, written for an AI judge: what it is, the problem, numbered "do X, see Y" steps. **No marketing copy.**
6. Confirm HACKATHON.md was read by listing the 13 track ids, then wait for the human's track prompt.

### NEVER without the human's explicit confirmation
- Send the submission (print the full JSON payload first, wait for a yes; one attempt per project)
- Post anything on X or any network
- Make the repo public, push, or force-push
- Sign transactions, spend tokens, or deploy to mainnet
- Commit secrets

### Never invent
Do not guess, generate or placeholder: project name, team lead, email, team size, tracks, NEAR payout account, repo link, demo post link, description, consent. Ask the human for each. Never create a NEAR account on their behalf. Never send the example payload values.

### Practical tips
- Dependencies move fast. Reports say a large share of early hackathon repos used deprecated NEAR APIs (keyStores, `@near-js/*` packages replaced by near-api-js 7; `near-sdk-js` is archived, "DO NOT USE"). Verify against current docs. A community tool, near-pedia (MCP endpoint https://near-pedia.xyz/mcp), checks for deprecated usage.
- Intents have **no testnet**: mainnet + tiny amounts + `dry: true` quotes.
- Give judges a **dry-run/simulation/fast-forward mode** so the project can be evaluated without funds or waiting (every starter prompt pushes this).
- Don't build around an API that may not be public without telling the human first (Agent Market).
- Keep demo hosted until 2026-11-18, ideally 2026-11-25.

---

## 8. Ecosystem partners and resources

| Partner | What | Docs | Site | Git |
|---|---|---|---|---|
| NEAR Intents | Cross-chain execution | docs.near-intents.org | intents.near.org | github.com/near/intents |
| Aurora | Ethereum on NEAR | doc.aurora.dev | aurora.dev | github.com/aurora-is-near |
| HOT | Chain abstraction | docs.hotdao.ai | hot-labs.org | github.com/hot-dao |
| Rhea | DeFi on NEAR | guide.rhea.finance | rhea.finance | github.com/rhea-finance |
| meme.cooking | Memecoin launchpad | docs.meme.cooking (API api.meme.cooking) | meme.cooking | n/a |
| HEX | Cross-chain swaps | hot-labs.gitbook.io/hex/concepts-and-systems/interactive-blocks | hex.exchange | n/a |
| NEAR.AI | Private AI | docs.near.ai | near.ai | github.com/nearai/cloud-api |
| SVRN | Sovereign tech | svrn.net/research/near-protocol | svrn.net | n/a |
| Trezu | Multisig treasury for Web3 teams | github.com/NEAR-DevHub/trezu-docs | trezu.org | github.com/NEAR-DevHub/trezu |
| SputnikDAO | DAO infrastructure | github.com/near-daos/sputnik-dao-contract#setup | x.com/SputnikDAO | github.com/near-daos/sputnik-dao-contract |
| OutLayer | Secure transactions for AI agents | app.outlayer.ai/docs/getting-started | outlayer.ai | github.com/out-layer/outlayer |
| GoMining | Bitcoin mining superapp | docs.gomining.com | gomining.com | n/a |
| Agent Market | Marketplace for AI agents | docs.market.near.ai (API market.near.ai/docs/) | market.near.ai | n/a |
| NEAR Builders | Builder community | nearbuilders.org/build | nearbuilders.org | github.com/nearbuilders |
| Gulf Labs | Invests in blockchain infra | n/a | gulf-labs.com | n/a |
| BRRRAIN | Memecoin with AI rewards | brrrain.fun/docs (API brrrain.fun/docs/api/) | brrrain.fun | n/a |
| NEAR Business | Confidential multisig treasury | docs.business.near.com | business.near.com | n/a |

Other key links:
- NEAR docs: https://docs.near.org/ . More resources: https://nearbuilders.org/build
- Official starter prompts repo: https://github.com/nearai/near-hackathon-prompt-examples
- NEAR DevHub YouTube (track prompt walkthroughs): https://www.youtube.com/channel/UCq0iWZQuXhvP8yQzDZsmWfQ
- NEAR AI Cloud credits/API key: https://cloud.near.ai ; $10 via https://nearbuilders.org/join
- 1Click partner registration (0.2% fee otherwise): https://partners.near-intents.org
- Public RPC list: https://docs.near.org/api/rpc/providers ; faucet: near-faucet.io
- Agent API demo base URL: https://api.demo.agentsonintents.com (temporary demo keys)
- NEAR MCP server: github.com/nearai/near-mcp (`npx @nearai/near-mcp@latest run`)
- Agent skills: github.com/near/agent-skills

### Community
- NEAR Discord: https://discord.gg/nearprotocol (questions, teammates, devrels on standby)
- Telegram builders chat: https://t.me/nearbuilderschat
- X: https://x.com/NEARProtocol (announcements; tag @NEARProtocol, #NEARHackathon, optional @NearLegion, @NearBuilders)

### Site sections
Tracks, Timeline, Projects (public build-log directory of submissions, searchable and filterable by track), Judges, Ecosystem, Toolkit (HACKATHON.md download), Submit.

---

## 9. Timeline

| When (UTC) | Event |
|---|---|
| 2026-10-19 | Announced. Code written from here counts (Q-001) |
| 2026-11-01 00:00 | Hackathon starts; submissions open |
| 2026-11-14 23:59 | Development ends; **submission deadline** (= 15 Nov 05:29 IST) |
| 2026-11-16 to 18 | Judging (AI screening then humans) |
| by 2026-11-18 23:59 | Results announced |
| ~by mid-Dec 2026 | Payout (within 30 days of results) |
| 2026-11-18 (ideally 11-25) | Keep hosted demo live until then |

---

## 10. Known gaps and caveats (be honest with the human)

1. **No official scoring weights.** Only the five prior-hackathon criteria (technical implementation, design, impact, originality, sustainability) plus per-track hints.
2. **Edit-after-submit contradiction** between SUBMITTING.md ("can't edit") and the website/HACKATHON.md (request-changes flow). Plan on getting it right the first time.
3. **Team size options overlap** (`2 - 4`, `4 - 6`, `6 - 8`); the form text lists them exactly this way.
4. **"Judges" includes AI** (Claude Code & Codex) as screeners with a "preliminary score"; humans make final calls.
5. Prize amounts are USD-denominated but **paid in NEAR**; exchange-rate timing isn't specified beyond "fixed in USD."
6. Third-party sites repeat the details but add nothing official; trust only nearhackathon.com, HACKATHON.md and the nearai repo.
7. The site's live "Projects" directory showed no data in the fetched snapshot ("Loading the build log..."), so competitor count wasn't verifiable.
