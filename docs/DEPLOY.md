# Deploy Floor for free (Vercel + Render)

Two processes: the **web app** (Next.js, on Vercel) and the **worker** (Node, long running: price feed, keeper, solver bots, arbitrage bot, HTTP API with an SSE stream, on Render). The contracts are already on NEAR testnet; nothing to deploy there.

```
browser ──▶ Vercel (web)        NEXT_PUBLIC_API_URL ─┐
browser ───────────────────────────────────────────▶ Render (worker)  ──▶ NEAR testnet RPC / Ethereum Sepolia / Groq
```
The browser talks to the worker directly (CORS), so the live SSE stream does not pass through Vercel.

## 1. Worker on Render
1. Push the repo to GitHub (the `.env` file is git-ignored; never commit it).
2. Render dashboard → **New → Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node. **Instance type:** Free.
   - **Root directory:** leave empty (repo root).
   - **Build command:** `corepack enable && NODE_ENV=development pnpm install --frozen-lockfile`
   - **Start command:** `pnpm --filter @floor/worker start`
   - **Health check path:** `/api/health`
4. **Environment variables** (copy the values from your local `.env`; mark keys as secret):
   `NODE_VERSION=24`, `NEAR_NETWORK`, `NEAR_RPC_URL`, `FUSDC_CONTRACT`, `POOL_CONTRACT`, `FLOOR_CONTRACT`, `SIGNER_CONTRACT`, `ADMIN_ACCOUNT`, `ADMIN_KEY`, `KEEPER_ACCOUNT`, `KEEPER_KEY`, `ARB_ACCOUNT`, `ARB_KEY`, `SOLVER_A_ACCOUNT`, `SOLVER_A_KEY`, `SOLVER_A_QUOTE_SEED` (same for B and C), `GUEST_PARENT`, `GUEST_PARENT_KEY`, `ENC_SECRET`, `EVM_RPC_URL`, `EVM_POOL_ADDRESS`, `EVM_EXPLORER`, `GROQ_API_KEY`, `GROQ_MODEL`, and later `WEB_ORIGIN` (your Vercel URL, step 2.4).
   Render sets `PORT` itself; the worker reads it.
5. Deploy. Open `https://<your-service>.onrender.com/api/health`; you should see `{"ok":true,...}`.

**Free-tier caveats**
- A free Render service **sleeps after about 15 minutes without traffic** and takes up to a minute to wake. While asleep the keeper and arbitrage bot are stopped. Keep it awake with a free pinger: [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org) hitting `/api/health` every 5 minutes. Check Render's current free limits; they change.
- The disk is ephemeral. Guest accounts and the cover list held in `.floor-state/` are lost on each redeploy or restart. For a demo this is fine (visitors just get a new account).
- Keep the testnet accounts funded: `GUEST_PARENT` pays for new guest accounts, the keeper and solvers need NEAR for gas.

## 2. Web on Vercel
1. Vercel → **Add New → Project** → import the same repo.
2. **Root directory:** `apps/web`. Framework: Next.js (auto-detected). **Node.js version:** 24.x (Project Settings → General).
3. **Environment variables** (Production): `NEXT_PUBLIC_API_URL=https://<your-service>.onrender.com` (no trailing slash).
4. Deploy. Copy the Vercel URL, then go back to Render and set `WEB_ORIGIN=https://<your-app>.vercel.app` (this locks CORS to your site) and redeploy the worker.
5. Open `https://<your-app>.vercel.app/play`: the header should show the live price and "streaming from the chain".

If the Vercel build cannot find the workspace, set the **Install command** to `cd ../.. && corepack enable && pnpm install --frozen-lockfile`.

## 3. Smoke test (do this before recording or posting)
1. `/api/health` on the worker returns `ok`.
2. `/play` → Give me an account → Get quotes: three quote cards (with an "AI agent" tag if `GROQ_API_KEY` is set).
3. Press **Watch it happen** and wait about 2.5 minutes for the finale.
4. `/time-machine` loads and plays (this page needs no worker).

## 4. Other free options
| Platform | Good for | Catch |
|---|---|---|
| **Render** (above) | worker | sleeps when idle; use a pinger |
| **Koyeb** | worker (free web service) | check current free limits and region; may need a card for verification |
| **Hugging Face Spaces** (Docker) | worker | needs a Dockerfile; sleeps after inactivity |
| **Oracle Cloud Always Free VM** | worker that never sleeps | needs a card for sign-up; you manage the server (`pm2`, Caddy for HTTPS) |
| **Cloudflare Pages / Netlify** | web instead of Vercel | Next.js feature support differs; Vercel is the simplest |
| **Fly.io, Railway** | | no longer reliably free |

Free tiers change often; confirm limits on each pricing page before relying on one.

## 5. After deploying
Put the live URL, the video URL and the X post URL into the table at the top of `README.md`, and keep both services up through 2026-11-18 (ideally 2026-11-25) so judges can try it.
