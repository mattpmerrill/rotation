# Rotation: plan

Grow our BTC stack over ~3 years by trading top-100 alts under strict, written rules.
Everything is measured in BTC and USD. v1 is read-only: no order placement, read-only
exchange keys only.

Owner: Matt. Architect: Beck. Last updated 2026-09-23.

## Decisions so far

| # | Decision | Date |
|---|---|---|
| 1 | Profit ladder triggers on **USD** gain from entry (easier for everyone to read). BTC-relative performance is still reported everywhere. | 2026-09-23 |
| 2 | Regime order: **Euphoria** (3+ flags) > **Defend** (BTC weekly close below a falling 200D SMA, or the -25% breaker) > **Expand** (BTC above 200D, dominance falling over 30D, 50%+ of the universe above its ALT/BTC 50D) > **Accumulate** (everything else). | 2026-09-23 |
| 3 | Leverage bucket = **collateral posted**, not exposure. Euphoria leverage = **0%**. Leverage is **off** until the backtest shows it adds BTC after fees. See "Leverage" below. | 2026-09-23 |
| 4 | Repo: `~/Work/rotation`, private on `mattpmerrill` GitHub. | 2026-09-23 |
| 5 | Custom daily-step simulator instead of vectorbt as the core backtester, so the backtest and the live engine run the *same* rule functions. | 2026-09-23 |
| 6 | pandas only (no polars). Backtests read Parquet directly; Postgres holds what the dashboard and bot need. | 2026-09-23 |
| 7 | **Portfolio design: a BTC core + an alt sleeve.** Example: 11 BTC, 9.9 kept as a core that is never sold to rebalance, 1.1 as the alt sleeve that runs every rule. Success = total BTC grows. Profits route into the core; the sleeve's idle money is held as BTC; sleeve losses are never topped up. The bucket table applies inside the sleeve. Replaces the doc's USD-weighted buckets, which sold BTC into every rally. | 2026-09-24 |

Open: CoinGecko Analyst month (see "Data"). Terms the program doc left undefined have
proposed defaults marked `# DEFAULT` in `config/rules.yaml`, explained in `RULES.md`.

## Architecture

```
GitHub Actions cron (daily, 00:15 UTC)
  engine: fetch -> Parquet cache -> gates / scores / regime / flags -> write Supabase
Supabase: Postgres + Auth + RLS
  shared market data (read-only to users), per-user portfolios (RLS), config_versions
web (Next.js, Vercel): reads Supabase
bot (discord.py, small always-on host): reads Supabase, calls engine for /score and /rotate
Claude API: turns the computed daily brief into 10 plain-English lines. Never does math.
```

Why this shape:
- Supabase cron can't run Python. GitHub Actions is free, logged and re-runnable.
- The Discord bot holds a gateway connection, so it needs an always-on process. It
  gets its own small host, separate from anything customer-facing.
- Rules are pure functions (no I/O). The backtester, the daily job and the bot all call
  the same code, so what we tested is exactly what runs.
- Every output row stores the `config_hash` of the rules that made it.

## Repo

```
config/          rules.yaml (every threshold), universe.yaml (exclusions, memes)
docs/            PLAN.md, RULES.md, CHANGELOG-RULES.md, backtests/
engine/          Python 3.12, uv
  src/rotation/
    config.py    typed loader; typos and bad sums fail loudly
    data/        binance_archive, coingecko, coinmetrics, cache (Parquet), http
    rules/       gates, score, ladder, routing, rotation, leverage, regime, flags,
                 breakers, sizing  (pure functions)
    portfolio/   position and bucket state, in BTC and USD
    backtest/    sim (daily step), walkforward, experiments, report
    cli.py       rotation config | fetch ... | backtest ... | daily
  tests/
supabase/migrations/
web/  bot/       Phase 1-2
```

## Data

### Sources (verified 2026-09-23)

| Need | Source | Cost | Coverage |
|---|---|---|---|
| Daily OHLCV, incl. delisted pairs | Binance archive (data.binance.vision) | free | 2017-08 on. LUNA (dead 2022) still there. |
| Perp funding | Binance archive | free | ~2020-01 on (BTC) |
| Perp open interest | Binance archive, daily files of 5-min snapshots | free | ~2020-09 on (BTC), ~2021-12 (SOL) |
| BTC market cap + MVRV (for MVRV Z) | CoinMetrics Community API | free | 2010 on |
| Point-in-time top-100 ranks, market caps, volumes, categories | CoinGecko | see below | Demo/Basic: last 2 years only. Analyst+: daily from 2013, plus `status=inactive` (dead coins) |
| BTC dominance, Altcoin Season Index | computed from our own top-100 market caps | free | follows CoinGecko coverage |
| Token unlocks | none free with history | - | live: manual field. Backtest: skipped and labelled. |
| Exchange count per coin | ccxt markets (live) | free | backtest: approximated by Binance + CoinGecko tickers |

### CoinGecko recommendation

Pricing from coingecko.com/en/api/pricing, 2026-09-23:

| Plan | $/month | History |
|---|---|---|
| Demo | free | 2 years daily |
| Basic | $35 | 2 years daily |
| **Analyst** | **$129** | **daily from 2013, inactive coins** |
| Lite | $499 | same as Analyst, more calls |

The free tier cannot answer the questions we're asking. Four of the five backtest
questions are about 2017, 2020-21 and early 2023, all outside a 2-year window. And
without dead coins, the backtest only sees survivors, which flatters every alt strategy
(that's survivorship bias, and it's the main way crypto backtests lie).

**Recommendation: buy one month of Analyst ($129), backfill everything into the
Parquet cache, cancel.** History doesn't change, so we keep it forever. Day-to-day we
run on the free Demo key plus Binance. The backfill is a few thousand calls, well
under Analyst's 500k monthly credits.

### Data gotchas already found

- **Ticker reuse.** `LUNAUSDT` on Binance is Terra Classic until 2022-05-13 ($0.00005),
  then the unrelated Terra 2.0 from 2022-05-31 ($8.87). Stitched naively, that's a fake
  +17,000,000% trade. Coin identity is the CoinGecko id; exchange tickers map to a coin
  only for a date range (`exchange_symbols` table). The loader breaks series at gaps
  and cross-checks Binance closes against CoinGecko.
- Binance spot timestamps switched from milliseconds to microseconds in 2025.
- CoinGecko daily points stamped D 00:00 are the close of D-1. We shift them so `date`
  means "close of this UTC day" in every source.
- Binance monthly files cover completed months only; the live job tops up from ccxt.

## Leverage (decision 3, explained)

Leverage means borrowing to hold more than your cash buys. At 3x, a 10% drop costs you
30%, and if the price falls far enough the exchange closes the position and keeps the
margin (liquidation). That's how people get wiped out in crypto.

Your goal is to grow BTC steadily over 3 years with friends following the same system.
Leverage doesn't serve that goal well until it's proven, so:
1. The bucket % is the **most margin you can have posted**, not total position size.
   The planned loss if both stops hit is 2% of the portfolio (1% per trade, 2 trades).
   The worst case, price gapping straight through a stop to liquidation, is capped at
   the posted margin (the bucket %), because margin is isolated per position.
2. **Euphoria = 0%.** Near a cycle top is the worst time to be leveraged.
3. **Off by default.** The backtest runs with and without it. If it doesn't add BTC
   after fees and funding, it stays off.

## Phases

### Phase 0: data, rules, backtest (now)

1. **Scaffold** (done): repo, config schema + validation, CI, data fetchers for the free
   sources, parser tests.
2. **CoinGecko backfill** (needs Analyst): all active + inactive coins, then daily
   market caps, so we can compute point-in-time top-100 per day. Cross-check ranks
   against a handful of known historical snapshots.
3. **Coin identity + loader:** CoinGecko id to Binance ticker by date range; Parquet to
   Postgres for the tables in the migration.
4. **Rule functions, test-first:** gates, score, ladder, routing, time stop, rotation,
   leverage sizing, regime, flags, breakers, bucket sizing.
5. **Simulator:** decide at the daily close, fill at the next open, 0.3% fee + 0.1%
   slippage per side, funding cost on leverage.
6. **Experiments + report** in `docs/backtests/`:
   1. Ladder vs hold for alts, 2020-21 and 2023-25 runs, in BTC
   2. Does the ALT/BTC 50D filter help
   3. Does the BTC 200D regime switch cut drawdown
   4. Would flags + backstop have exited near the 2017, 2021 and 2025 tops
   5. Score threshold 3 vs 4

   Each result is labelled **full rule** or **degraded** (which inputs were missing, e.g.
   no OI before 2020-09, no unlock data, no funding in 2017).

Honest limit: three cycles is thin. The backtest shows the direction and size of each
rule's effect; it can't prove statistical significance.

**Done when:** the report exists, every rule function has tests, and we've agreed which
rules stay, change or go.

### Phase 1: dashboard (after Phase 0 results)

Holdings in BTC + USD, buckets vs targets, positions with ladder progress and stops,
watchlist scores, regime + flags panel, rotation calculator, trade journal, Koinly CSV
export. Read-only exchange keys per user, stored encrypted with Supabase Vault, never in the repo.

### Phase 2: Discord bot

#daily-brief (regime, flags, top scores, triggered levels, 10-line Claude summary),
#alerts, `/score <coin>`, `/rotate <a> <b>`, `/status`, `/journal`.

### Phase 3: multi-user + smart money

Supabase auth, one portfolio per friend (RLS), BTC-gained leaderboard. Tracked-wallet
list; flag when 3+ tracked wallets add the same token within 7 days; warn on exchange
deposits.

## Working agreements

- Every threshold lives in `config/`. Changes bump `version` and get a line in
  `CHANGELOG-RULES.md`.
- Every rule function has tests. CI runs lint, config validation and tests on each push.
- Secrets in `.env` only. Market data cache (`/data`) is never committed.
