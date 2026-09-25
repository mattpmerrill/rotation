# Rotation: plan

**Goal: hold more BTC at the end of each cycle than at the start.** Buy and hold BTC, add a
small alt basket at the right point in the cycle, sell half the BTC and all the alts near the
top, and rebuy BTC near the bear-market bottom. No round trips. Everything is scored in BTC.

v1 is read-only: the system tells you what to do and when; you place the trades.

Owner: Matt. Architect: Beck. Last updated 2026-09-25.

## The strategy (Matt, 2026-09-25)

Example: 11 BTC.

| Phase | When (next cycle, estimated) | Action |
|---|---|---|
| Hold | now to the halving (~Apr 2028) | Hold 11 BTC. Don't buy alts in the bear: in both past cycles, alts bought at this point lost 24-32% against BTC. |
| Alt buys | halving, +60, +120, +180 days (~Apr-Oct 2028) | Move 1 BTC into a five-alt basket in 4 equal slices. Keep 10 BTC as the core. |
| Hold | to the sell window | No selling on the way up: selling alts on +25% gains lost BTC in the backtest. |
| Sell window | days 500-580 after the halving (~Aug-Nov 2029) | Sell 50% of the BTC and 100% of the alts into USDT, in 4 tranches. |
| Bear rebuy | 360 days after the high, or -80%, or MVRV < 1 | Deploy the USDT into BTC in 4 monthly tranches. Everything left goes back in by 540 days after the high, or at once on a new all-time high. |

Evidence (all from 1 BTC, 1% fee per trade, no tax):

- BTC cycle harvest alone beat holding in every complete cycle when each cycle was scored
  with settings chosen without it (`docs/backtests/cycle-harvest.md`).
- The five-largest-alt basket bought in 4 slices from the halving to +180 days beat holding
  BTC in all three cycles by the time the sell window opened: 2.06x, 1.58x, 1.29x.
- Explore any strategy and any five-alt basket: **BTC Stack Explorer**
  (https://claude.ai/artifact/LTQWG2sXRZhxtsTQuCZku1, shared with the group).

Limits: three or four cycles is a small sample. Each past bull had an alt season; if the next
doesn't, the alt basket bleeds against BTC. The halving clock worked for the 2016, 2020 and
2024 tops but not 2013.

## Decisions

| # | Decision | Date |
|---|---|---|
| 1 | Profit ladder triggers in USD. *(Superseded by 11: no ladder in the chosen strategy.)* | 2026-09-23 |
| 2 | Regime order Euphoria > Defend > Expand > Accumulate. *(Kept in the engine; not used by the chosen strategy.)* | 2026-09-23 |
| 3 | Leverage off. | 2026-09-23 |
| 4 | Repo `~/Work/rotation`, private on `mattpmerrill` GitHub. | 2026-09-23 |
| 5 | Custom daily-step simulator, so the backtest and the live engine run the same rule functions. | 2026-09-23 |
| 6 | pandas only; backtests read Parquet, Postgres holds what the app reads. | 2026-09-23 |
| 7 | BTC core + alt sleeve instead of USD-weighted buckets (which sold BTC into every rally). | 2026-09-24 |
| 8 | Primary strategy: BTC cycle harvest (halving-clock sell window, bear rebuy). Supabase project `rotation` (ref `xtccrljmxtjmxbosczrd`) in the free 21 Stacks org. | 2026-09-24 |
| 9 | Matt's BTC is in an IRA: no tax, 1% fee per trade (`config/rules.yaml` `cycle.account`). | 2026-09-24 |
| 10 | Discord alerts never show holdings or amounts, only shares ("sell 1/12 of your stack"). Exact amounts only in an optional private channel. | 2026-09-24 |
| 11 | **Strategy:** 10 BTC core + 1 BTC alt basket; alts bought in 4 slices from the halving to +180 days; sell 50% BTC and 100% alts in the window; rebuy BTC in the bear. | 2026-09-25 |
| 12 | **Each person picks their own five alts**, using the Basket Lab to test the pick against history. | 2026-09-25 |

## Architecture (now)

```
GitHub Actions, daily 13:15 UTC
  rotation signal: CoinMetrics BTC price + MVRV -> cycle phase, actions due -> Discord webhook
Supabase (rotation): market data tables (loaded by `rotation load`)
BTC Stack Explorer: static page built by `rotation explorer` from the backtest data
```

## Architecture (app v1, next)

```
GitHub Actions daily job
  1. fetch BTC price + MVRV (CoinMetrics) and the top-200 alts (CoinGecko free Demo)
  2. for each person: read their plan + trade log from Supabase -> compute their actions
  3. post the public alert (shares only) to Discord; store each person's actions
Supabase: Postgres + Auth + RLS
  public: cycle state, market data         private (RLS, per person): plan, basket, trades
web (Next.js on Vercel): cycle clock, my plan, my stack, Basket Lab
```

No always-on Discord bot: the webhook covers alerts, and the app covers everything
interactive. That removes a server to run.

## App v1: four pages

1. **Cycle clock** (home, public). Days since the halving, the current phase, BTC vs its
   high, MVRV, and a dated timeline of every upcoming action. Safe to share.
2. **My plan** (private). Your schedule with exact amounts: the four alt slices with your
   five coins, the four sell tranches, the bear rebuy tranches.
3. **My stack** (private). BTC, alts and USDT; a "log a trade" form; your BTC count over time
   against "if I'd just held." The daily signal reads holdings from here (this replaces the
   GitHub secrets).
4. **Basket Lab**. Pick five alts, see how they would have done in each past cycle under the
   plan, against holding BTC, the five-largest rule, and 1,000 random baskets. Save the basket
   to your plan. (Prototype live in the BTC Stack Explorer.)

Friends: each logs in and gets a private plan and stack. The cycle clock and Discord alerts
are shared and show shares only, never amounts. A leaderboard, if wanted later, ranks by BTC
growth (e.g. +18%), never by amount.

### Engine changes for v1

1. BTC sell target 1/3 -> 1/2 (config).
2. Signal: alt-basket steps (buy slice k of 4; sell all remaining alts in the window
   tranches), with replay tests against the backtest like the BTC steps.
3. Holdings and trades from Supabase instead of GitHub secrets.
4. Basket per person, validated against a list of coins their account can hold.
5. Trim market data to BTC + the top 200 alts (the app doesn't need 1,500 coins).

### Supabase tables (new)

`profiles` (person, display name), `plans` (person, BTC core, alt budget, sell share, chosen
five coins), `trades` (person, date, coin, side, qty, price, note), `cycle_state` (daily
phase and dates), `actions` (person, date, what the rules say to do). RLS: a person reads and
writes only their own rows; everyone reads `cycle_state` and market data.

### Order of work

1. Engine changes 1-3, with tests (the pages sit on these).
2. Supabase migrations + RLS, checked with the Supabase security advisor.
3. Next.js app: cycle clock and Basket Lab first (public), then my plan and my stack (auth).
4. Daily job writes `cycle_state` and `actions`; the Discord alert reads the same data.

Estimate: 1-2 weeks. No hurry: the next trade is the first alt slice around April 2028.

### Decisions made (2026-09-25)

- Logins for everyone in v1: email/password and Google (Supabase Auth).
- Coins: any alt in the top 100 on the buy date (Matt's IRA offers nearly all of them).

### Status (2026-09-25)

Built: people/plans/trades/actions tables with RLS (cross-user isolation tested), the
per-person plan calculator (replays the backtest exactly), the daily job (cycle state +
actions + public Discord brief), and the app (cycle clock, sign-in, my plan, my stack; Basket
Lab served from the explorer). Deployed on Vercel as `rotation-web` (root `web/`).

## Phase 0 (done, 2026-09-23 to 09-25)

Data: point-in-time top 100 since 2016 from a one-month CoinGecko Analyst backfill (57,781
coins incl. dead ones), CoinMetrics prices and MVRV, Binance funding and open interest.
Rule engine for the original program doc (gates, score, ladder, rotation, regime, flags,
breakers), backtester, and reports:

- `docs/backtests/phase0-report.md`: the original alt-trading rules lost BTC
  (USD-weighted buckets: 11 BTC -> 2.5 BTC over 2019-26).
- `docs/backtests/cycle-harvest.md`: the BTC cycle harvest, leave-one-cycle-out.
- BTC Stack Explorer: every strategy, alt entry timing, Basket Lab.

The original rule engine stays in the repo, tested and switched off.

## Data

| Need | Source | Cost |
|---|---|---|
| BTC price, market cap, MVRV | CoinMetrics Community API | free |
| Point-in-time alt ranks and prices, 2016 on | CoinGecko Analyst backfill (cached; plan can be cancelled) | one month, $129 |
| Current top 200 alts (live) | CoinGecko Demo | free |
| Funding / open interest | Binance public archive | free |

Data gotchas found: Binance reuses tickers (LUNAUSDT), CoinGecko's 2017-18 daily prices are
noisy (BTC off by up to 21% on some days), CoinGecko has impossible market caps on dead
markets, and CoinMetrics publishes MVRV about a day after price.

## Working agreements

- Every threshold lives in `config/`. Changes get a line in `CHANGELOG-RULES.md`.
- Every rule function has tests; the live signal is tested to replay the backtest exactly.
- Secrets in `.env` and GitHub secrets only. No holdings in public channels or logs.
