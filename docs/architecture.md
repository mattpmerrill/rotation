# Architecture

How the 1 Bitty Challenge is put together, and where each kind of code belongs. Read this before
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
   Coin icons are CoinGecko image URLs saved in `coins.image_url` by the daily job.
   `rotation buy-timing` writes `web/public/data/buy-timing.json` (the Best time to buy page);
   its results only change when a sell window passes, so rerun it after each one.

## The database

Migrations in `supabase/migrations/`, tests in `supabase/tests/database/` (pgTAP).

| Table / view | What | Who writes |
|---|---|---|
| `profiles` | One per sign-up; `is_member` is set by Matt | trigger on sign-up; Matt |
| `challenges` | One per cycle; at most one open | Matt (SQL) |
| `entries` | A person's run: start date, BTC in (≤ 1), basket and waiting slots (2–8 picks) | the person, via `start_entry()` and `fill_slot()` |
| `entry_trades` | Every trade, against USDT, with a kind: `buy_in`, `fill` (via functions), `sell`, `rebuy` (by the person) | the person |
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
| `trades` | – | log a sell or rebuy, fill a waiting slot, delete a sell or rebuy |
| `picker` | eligible coins, buy-in prices | start an entry |
| `picks` | Joi's top picks: fixed baskets (`picks.ts`) previewed with `data/history.ts` | – |
| `timing` | Best time to buy: `data/timing.ts` (engine research) through `domain/timing.ts` | – |
| `notifications` | everything (secret key) | Discord posts |

**Patterns:**

- Every Server Action starts with `requireMember()` (actions are reachable by direct POST), parses
  its input with zod, calls one service in `features/<name>/service.ts`, and turns the
  `ApplicationResult` (`lib/result.ts`: `ok` or `fail` with a stable code) into what the form shows.
  The service checks the domain rules and asks the repository in `data/` to write; database failures
  are translated by `data/failure.ts`, which logs the unexpected ones and returns a generic message.
  Only `trades` follows this so far; the picker and auth still call `data/` from the action
  ([exception 1](exceptions.md)).
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

## The auth model

- **Who can sign in:** anyone can create an account (email and password, or Google). Nothing is
  visible until `profiles.is_member` is set, by Matt, in SQL. Non-members see one screen saying so.
- **How identity is known:** Supabase Auth issues a session cookie. `proxy.ts` only refreshes it
  (`data/session.ts`); it is not the authorization boundary. Pages and actions verify identity with
  `getClaims()` (`data/viewer.ts`), never the unverified session user.
- **Who may do what:** `requireViewer()` at the top of every private page; `requireMember()` at the
  top of every Server Action, because actions are reachable by direct POST. Members read everyone's
  entries and trades and write only their own.
- **What actually enforces it:** row-level security and the `SECURITY DEFINER` functions, which check
  the caller themselves ([ADR-005](decisions/ADR-005-security-definer-functions.md)). The app checks
  first to give friendly messages; the database is the authority.
- **The one machine caller:** `/api/jobs/daily` accepts `Authorization: Bearer <CRON_SECRET>`,
  compared in constant time. The secret (service) key lives only in `data/supabase/admin.ts`, used
  by that job.

## Environments

| Environment | Where | Database | Configuration |
|---|---|---|---|
| Local | your machine | Docker Supabase (`supabase start`) | `web/.env.development.local`, `.env` |
| Production | Vercel project `rotation-web` (root `web/`) | Supabase project `rotation` (us-west-1, free plan) | Vercel env, GitHub secrets |

There is no staging environment. Vercel's Preview scope currently carries the production Supabase URL
and publishable key, so a preview of a non-`main` branch would talk to production data: only `main`
is pushed, and this is recorded as [exception 15](exceptions.md).

## Deployment

Trunk is production ([ADR-001](decisions/ADR-001-adopt-engineering-standards.md)).

1. The local check and the pre-push hook are the gate (`node scripts/check.mjs`).
2. A push to `main` starts Vercel's Git integration, which builds `web/` on Node 22 (`engines` in
   `web/package.json`) and deploys it to production.
3. CI reruns the checks on a clean Linux checkout. The `post-deploy` workflow waits for
   `/api/health` to report the pushed commit, then runs the browser suites against production.
4. Database migrations are applied before the code that needs them, with `supabase db push`, and are
   backward compatible so a code rollback stays safe.
5. The daily job (`daily.yml`, 13:15 UTC) is independent of deploys.

Rollback: [runbooks/rollback-deployment.md](runbooks/rollback-deployment.md).

## Integrations

Each vendor is reached through one module, and vendor shapes stop there.

| Vendor | Used for | Where | If it is down |
|---|---|---|---|
| CoinGecko | Top-250 market list and ranks (engine), live prices (web) | `engine/.../data/coingecko.py`, `web/src/data/prices.ts`, `data/live.ts` | Live value falls back to daily closes; the engine run fails and retries next day |
| CoinMetrics | BTC price and MVRV | `engine/.../data/coinmetrics.py` | The engine run fails; nothing saved changes |
| Discord | Posts (buy-ins, trades, the rebuy window, Sunday standings) | `web/src/data/discord.ts` | Posts are released and retried on the next daily run. At the time of writing (2026-09-28) `DISCORD_WEBHOOK_URL` is not set in Vercel, so no posts go out |
| Google OAuth | Sign-in | Supabase Auth | Email sign-in still works |

## Backup and restore

There is no backup of members' data today: the Supabase project is on the free plan. Market data can
be rebuilt by the engine; baskets and trades cannot. This is [exception 11](exceptions.md); the
procedure, and what is and is not recoverable, is in
[runbooks/restore-database.md](runbooks/restore-database.md).
