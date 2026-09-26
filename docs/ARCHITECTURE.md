# Architecture

How the 1 BTC Challenge is put together, and where each kind of code belongs. Read this before
changing anything; `CONTRIBUTING.md` has the working rules.

## The system

```
                 ┌──────────────── GitHub Actions, daily 13:15 UTC ────────────────┐
                 │ 1. engine: `rotation daily`        2. POST {APP_URL}/api/jobs/daily │
                 └──────────┬───────────────────────────────────┬─────────────────┘
                            │ writes market data                │ Bearer CRON_SECRET
                            ▼                                   ▼
 CoinMetrics ─┐     ┌─────────────────┐    reads/writes    ┌──────────────┐    posts    ┌─────────┐
 CoinGecko  ──┴──▶  │ Supabase        │ ◀────────────────▶ │ web (Next.js │ ──────────▶ │ Discord │
                    │ Postgres + Auth │   as the person    │ on Vercel)   │             └─────────┘
                    │ + RLS           │   (RLS applies)    └──────────────┘
                    └─────────────────┘                          ▲
                                                                 │ browsers (members)
```

| Part | Folder | Owns | Language |
|---|---|---|---|
| Engine | `engine/` | Market data (prices, ranks, BTC cycle state), research and backtests, static data for the web app | Python 3.12, uv |
| Database | `supabase/` | Schema, access rules (RLS), and the fairness rules (1 BTC cap, basket size, no overselling) | SQL migrations, pgTAP tests |
| Web app | `web/` | Everything about people: entries, trades, valuations, the leaderboard, charts, Discord posts | TypeScript, Next.js 16, React 19 |
| Config | `config/` | Every research threshold (`rules.yaml`), the coin universe (`universe.yaml`) | YAML |

**One home per concern.** The engine never computes anything about a person; the web app never
fetches market data. They meet only in the database. That's why the Discord job lives in the web
app: it needs valuations, and valuations are TypeScript.

## Data flow

1. **Daily, 13:15 UTC.** `rotation daily` pulls BTC price and MVRV (CoinMetrics) and the top 250
   coins (CoinGecko), plus any coin an entry holds, and writes `market_state` and `daily_prices`.
2. The same workflow then calls the app's `/api/jobs/daily`, which values every entry and posts
   what's new to Discord (buy-ins, trades, the rebuy window opening, Sunday standings). Each post
   is recorded in `notifications`, so it goes out once.
3. **When someone uses the app,** pages read through Supabase as that person, so row-level
   security decides what they see. Valuations are computed on request from trades and prices
   (four people, a few hundred days: milliseconds).
4. **Static data** for the basket picker's history preview is built by `rotation web-data` into
   `web/public/data/basket-history.json`, and the reference dates into
   `web/src/generated/market-reference.json`. Rebuild both when `config/rules.yaml` changes.

## The database

Migrations in `supabase/migrations/`, tests in `supabase/tests/database/` (pgTAP).

| Table / view | What | Who writes |
|---|---|---|
| `profiles` | One per sign-up; `is_member` is set by Matt | trigger on sign-up; Matt |
| `challenges` | One per cycle; at most one open | Matt (SQL) |
| `entries` | A person's run: start date, BTC in (≤ 1), basket (2–8 coins) | the person, via `start_entry()` |
| `entry_trades` | Every trade, against USDT | the person |
| `entry_balances` (view) | Holdings per entry, including USDT | – |
| `coins`, `daily_prices` | Market data | engine |
| `market_state` | BTC vs its high, MVRV, rebuy window | engine |
| `notifications` | Discord posts already sent | web job |

Access: members read everything in the challenge and write only their own entry and trades.
Non-members see nothing. The fairness rules live in the database (`check_entry_trade`, a
deferred constraint trigger), so no client can get around them. The app checks the same
rules first to give friendly messages (`web/src/domain`).

## The web app

```
web/src/
  app/        Routes only: each page checks access, calls one feature query, composes components
  features/   One folder per feature: queries.ts (read), actions.ts (write), schema.ts (input), components/
  data/       The data access layer: Supabase clients, queries by table, Discord, env. server-only
  domain/     The challenge's rules and math. Pure TypeScript: no React, no Next, no I/O. Unit-tested
  ui/         Presentational components and chart primitives. Props in, markup out
  lib/        Tiny generic helpers (dates, number formatting)
  generated/  Files written by the engine. Don't edit by hand
```

**Dependency direction, enforced by ESLint** (`web/eslint.config.mjs`):

```
app ─▶ features ─▶ data ─▶ domain ─▶ lib
          └──────▶ ui ────────┘
```

- A layer imports only from layers below it. `domain` and `lib` import no framework.
- Features never import each other. Compose them in `app/`, or move shared code down to
  `domain`, `data` or `ui`.
- Pages import `data/viewer` directly (the access check) and nothing else from `data`.

**Features:**

| Feature | Reads | Writes |
|---|---|---|
| `auth` | – | sign in / up / out, the auth callback |
| `leaderboard` | standings for everyone, market state | – |
| `entry` | one entry: value series, coins, reference dates | – |
| `trades` | – | log a sell or rebuy, delete a trade |
| `picker` | eligible coins, buy-in prices | start an entry |
| `notifications` | everything (secret key) | Discord posts |

**Patterns:**

- Every Server Action starts with `requireMember()` (actions are reachable by direct POST),
  parses its input with zod, checks the domain rules, then calls `data/`.
- Valuation is `domain/valuation.ts`: balances from trades, priced at each day's close, in
  USD and BTC. Everything else (standings, charts, Discord) builds on it.
- Amounts are passed to the client in both units; `ui/unit.tsx` switches BTC/USD instantly.
- Charts use Recharts with shared tokens in `ui/charts/theme.ts`. Series colors were checked
  for color-blind separation on the dark surface; reuse them rather than adding new ones.
- Design tokens live in `app/globals.css` (`bg-surface`, `text-ink-2`, `text-btc` ...). The app
  is dark-only.

## Secrets and configuration

| Where | Name | Used by |
|---|---|---|
| `.env` (repo root) | `SUPABASE_DB_URL`, `COINGECKO_API_KEY`, `COINGECKO_PLAN` | engine |
| GitHub secrets | the above + `APP_URL`, `CRON_SECRET` | daily workflow |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `DISCORD_WEBHOOK_URL` | web app |
| `web/.env.development.local` | local Supabase keys (`supabase status`) | local dev |

Only `web/src/data/env.ts` reads `process.env` in the app; it validates everything with zod.
