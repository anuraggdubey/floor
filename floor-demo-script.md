# Floor: demo and video script (write code to serve this)

Goal: a stranger understands the problem in 6 seconds, gets a "wait, that actually works?" moment, and can play it themselves. One complete moment: buy cover, break the peg, get paid. Rules from the hackathon: post on X says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, attaches the video, explains NEAR's role concretely, links demo and repo, ends with a genuine question. The human posts it. A video is required; screenshots alone are not enough.

## The story in one line
"USDC fell to about 87 cents in March 2023 and holders had no way to hedge. This is cover that pays itself. Break the peg and watch."

## Shot list (target 75 to 85 seconds)
| Time | On screen | Voice / caption |
|---|---|---|
| 0-6 | Real USDC March 2023 chart (labelled "historical, not our data") plunging to about 0.87, cut to black, title "FLOOR" | "March 2023. A stablecoin loses its peg in a weekend. You cannot buy cover in time." |
| 6-18 | `/play`: a guest account appears, three solver cards bid live; premiums tick; "best quote" badge; press Buy; NEAR explorer tx flashes | "Solvers compete to back your cover with their own margin. The best quote wins." |
| 18-38 | Split view: chart left, big red DUMP button right. Press it three times. Price falls through the tier lines; quotes widen; solver C shows "pulled out"; a second visitor presses Buy and gets a red `GATE_CLOSED` with the tx link | "Break the peg yourself. The market reprices in real time. Late buyers are blocked on-chain." |
| 38-52 | Sustain countdown ring fills; keeper fires; policy flips Active to Triggered; payout tx on NEAR appears; holder balance ticks up | "Held below the line for 30 seconds. No claim form. The contract pays." |
| 52-72 | The climax: contract asks the NEAR MPC to sign; EVM explorer shows USDC arriving in the viewer's own address; balance on the wallet screen ticks up in real time. Solver margin bar drops, solvency bar stays green | "NEAR Chain Signatures signs a native payout on a chain NEAR does not live on." |
| 72-85 | End card: "Break the peg yourself" + live link + repo + one question ("what would you pay to hedge a depeg?") | none, music resolves |

If F3 is not shipped, replace 52-72 with a slow macro of the NEAR payout tx and the solver margin and solvency bars, and keep the same ending. Do not mention an EVM payout in the post if it did not run.

## Production rules
- Script and storyboard first; build `/play` so each shot is a single screen state. Hide anything that is not in a shot.
- Record at 60 fps, 1080p or higher, clean browser profile, dark theme, no bookmarks bar, no notifications. Use fixed seeds so every take behaves the same; pre-warm the keeper and fund solver margins before recording.
- Shorten the demo parameters (sustain, lookback, wait) in the recording environment only, and say so in the README.
- Big type, large buttons, one strong colour for danger and one for payout. Smooth counters, sound cues for DUMP, GATE_CLOSED and payout. No terminal, no code, no live-coding, no scrolling around.
- Record several takes and keep the cleanest; also keep a backup recording of the full flow in case the live demo is flaky during judging.
- Subtitles on; the first line works muted. Keep the video under 90 seconds; post a longer walkthrough in the README if wanted.
- Show real transaction hashes and explorer links, not mock-ups; label anything simulated (scripted solvers, demo stable, demo credits).

## X post draft (human edits and posts)
Line 1: "Stablecoin depeg cover that pays itself. Break the peg live: [link]." Then: built at NEAR HACKATHON; what NEAR does (own contracts enforce the state gate and trigger, solvers' signed quotes verified in-contract, Chain Signatures signs the payout on another chain); what is simulated (scripted solvers, demo stable, testnet credits); repo link; the question. Tag @NEARProtocol and #NEARHackathon. Video attached.

## Rehearsal checklist
- Fresh clone runs `make verify` and `make dry` and the steps in the README match the screen.
- Hosted demo survives ten visitors pressing Dump at once (rate limits, caps, the arbitrage bot recovers the peg).
- The faucet and payout caps hold; the pool and test funds are topped up the day before judging.
- The video was watched once on a phone, muted.
