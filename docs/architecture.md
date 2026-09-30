# Architecture

How the 1 Bitty Challenge is put together, and where each kind of code belongs. Read this before
changing anything; `AGENTS.md` holds the working rules and `CONTRIBUTING.md` the setup and deploy flow.

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
| `profiles` | One per sign-up; `is_member` and `is_admin` are set by the admin functions and SQL, never by the person | trigger on sign-up; the admin functions |
| `admin_actions` | Audit trail of admin actions (ids only) | the admin functions |
| `challenges` | One per cycle; at most one open | the owner (SQL) |
| `entries` | A person's run: start date, BTC in (≤ 1), basket and waiting slots (2-8 picks) | the person, via `start_entry()` and `fill_slot()` |
| `entry_trades` | Every trade, against USDT, with a kind: `buy_in`, `fill` (via functions), `sell`, `rebuy` (by the person) | the person |
| `entry_balances` (view) | Holdings per entry, including USDT | - |
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
  app/           Routes only: each page checks access, calls one feature query, composes components
  features/      One folder per feature: queries.ts (read), actions.ts (write), service.ts (use case), schema.ts (input), components/
  data/          <thing>.repository.ts (the only place a query is built), env, Supabase clients, failure translation, access guards. server-only
  integrations/  One adapter per vendor: coingecko/ (live prices), discord/ (the group's webhook)
  domain/        The challenge's rules and math. Pure TypeScript: no React, no Next, no I/O. Unit-tested
  ui/            Presentational components and chart primitives. Props in, markup out
  lib/           Generic helpers with no business meaning (dates, formatting, ApplicationResult, logger, security headers)
  generated/     Files written by the engine. Don't edit by hand
  proxy.ts       Per request: a Content-Security-Policy with a fresh nonce, and the auth session refresh
```

Each folder has a README with what belongs there, what it may import and an example.

**Dependency direction, enforced by ESLint** (`web/eslint.config.mjs`) **and dependency-cruiser**
(`web/.dependency-cruiser.cjs`):

```
            app            routes: compose features, no logic
           /   \
    features    ui         vertical slices; presentational kit
     /   |   \    \
 data  integrations  \    repositories; one adapter per vendor
     \   /            \
     domain            |   pure rules
        |              |
       lib  <----------+   generic plumbing
```

| Layer | May import | Notes |
|---|---|---|
| `app` (and `proxy.ts`) | features, ui, domain, lib | Never `data` or `integrations`. A route reaches the session through `features/auth/viewer` |
| `features` | data, integrations, ui, domain, lib | Never another feature. The only layer that imports `integrations` |
| `data` | domain, lib | The only place queries are built. Does not reach vendors: a feature passes the vendor call in |
| `integrations` | domain, lib | An adapter owns the URL, a timeout, schema validation and the mapping to domain types. It does not read the environment: its caller passes the key in |
| `ui` | domain, lib | Never data, integrations, features or app |
| `domain` | domain, lib | No framework, database or Node built-ins |
| `lib` | lib only | No framework, no `@/` alias |

**Features:**

| Feature | Reads | Writes |
|---|---|---|
| `auth` | the viewer (session and profile) | sign in / up / out, the auth callback, password change |
| `admin` | the People page: who is waiting, who is in | approve, reject, remove, make a sign-in help link |
| `leaderboard` | standings for everyone, market state, live prices | - |
| `entry` | one entry: value series, coins, reference dates | - |
| `trades` | - | log a sell or rebuy, fill a waiting slot, delete a sell or rebuy |
| `picker` | eligible coins, buy-in prices | start, edit or delete an entry |
| `picks` | Joi's top picks: fixed baskets (`picks.ts`) previewed with `data/history.repository.ts` | - |
| `timing` | Best time to buy: `data/timing.repository.ts` (engine research) through `domain/timing.ts` | - |
| `notifications` | everything (secret key) | Discord posts |
| `security` | - | builds the Content-Security-Policy for a request |
| `health` | the deployed commit | - |

**Patterns:**

- Every Server Action starts with `requireMember()` (`requireAdmin()` for the admin's; `data/guards.ts`).
  Actions are reachable by direct POST. It then parses its input with zod, calls one service in
  `features/<name>/service.ts`, and turns the `ApplicationResult` (`lib/result.ts`: `ok` or `fail` with
  a stable code) into what the form shows. The service checks the domain rules and asks a repository
  in `data/` to write; database failures are translated by `data/failure.ts`, which logs the
  unexpected ones and returns a generic message. Reads throw on failure, because a failed read is
  unexpected. `trades`, `picker`, `auth` and `admin` all follow this.
- Pages are thin: an access check, one feature query that returns a view ready to render, and the
  components. Sums, flags and copy decisions come back from the query or a domain function.
- The files the engine writes (`web/public/data/*.json`, `src/generated/*.json`) are parsed with zod
  when the server starts (`data/history.repository.ts`, `timing.repository.ts`,
  `reference.repository.ts`), so a change on the Python side fails loudly instead of rendering wrong.
- Valuation is `domain/valuation.ts`: balances from trades, priced at each day's close, in
  USD and BTC. Everything else (standings, charts, Discord) builds on it.
- Amounts are passed to the client in both units; `ui/unit.tsx` switches BTC/USD instantly.
- Charts use Recharts with shared tokens in `ui/charts/theme.ts`. Series colors were checked
  for color-blind separation on the dark surface; reuse them rather than adding new ones.
- Design tokens live in `app/globals.css` (`bg-surface`, `text-ink-2`, `text-btc` ...). The app
  is dark-only.

## Security headers

- `src/proxy.ts` gives every page request a Content-Security-Policy with a fresh nonce and
  `strict-dynamic` (`features/security/content-security-policy.ts`, built by `lib/security-headers.ts`).
  Next.js reads the nonce from the request's policy and puts it on the scripts and styles it renders,
  so every page is rendered per request (`force-dynamic`).
- `next.config.ts` sets the static headers: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Permissions-Policy`. `poweredByHeader` is off.
- The policy allows the Supabase URL (from the environment) and the coin icon hosts in
  `COIN_IMAGE_HOSTS`, which `next.config.ts` shares. Adding a host, script or connection means
  updating it in the same change.
- `e2e/security-headers.spec.ts` asserts the headers are present.

## Secrets and configuration

| Where | Name | Used by |
|---|---|---|
| `.env` (repo root) | `SUPABASE_DB_URL`, `COINGECKO_API_KEY`, `COINGECKO_PLAN` | engine |
| GitHub secrets | the above + `APP_URL`, `CRON_SECRET` | daily workflow |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `DISCORD_WEBHOOK_URL` | web app |
| `web/.env.development.local` | local Supabase keys (`supabase status`) | local dev |

Only `web/src/data/env.ts` reads `process.env` in the app (ESLint refuses it anywhere else); it validates everything with zod, and a guard checks that `web/.env.example` lists exactly what it reads.

## The auth model

- **Joining:** anyone can create an account, with Google or an email and a password (name, email, password
  of at least 10 characters). Nothing is visible until an admin approves them on the People page
  (`/admin`). Until then they see a "waiting for approval" screen that refreshes itself, so approval shows
  up without a reload ([ADR-006](decisions/ADR-006-signup-and-approval.md)). Email confirmation is off for
  now, because the project has no email service ([exception 17](exceptions.md)).
- **Who is who:** `profiles.is_member` (approved) and `profiles.is_admin`. Neither can be changed through
  the API, not even with the secret key: an admin is made with SQL, and members are made by the admin
  functions below.
- **How identity is known:** Supabase Auth issues a session cookie. `proxy.ts` only refreshes it
  (`features/auth/session.ts`); it is not the authorization boundary. Pages and actions verify identity with
  `getClaims()` (`data/viewer.repository.ts`), never the unverified session user.
- **Who may do what:** `requireViewer()` at the top of every private page (routes import it from
  `features/auth/viewer`); `requireMember()` at the top of every Server Action for members, `requireAdmin()`
  for the admin's (`data/guards.ts`); actions are reachable by direct POST.
  Members read everyone's entries and trades and write only their own.
- **What actually enforces it:** row-level security and the `SECURITY DEFINER` functions, which check the
  caller themselves ([ADR-005](decisions/ADR-005-security-definer-functions.md), extended by ADR-006 with
  `is_admin`, `admin_list_people`, `admin_set_member`, `admin_reject_signup`, `admin_record_help_link`).
  Every admin action writes an `admin_actions` row by ids only. The app checks first to give friendly
  messages; the database is the authority.
- **A forgotten password:** the admin makes a one-time sign-in help link (the secret key generates the
  token; the action is audited first). `/auth/confirm` verifies it and starts a session, and `/auth/reset`
  lets the person choose a new password. The link works once and expires within an hour.
- **What the sign-in page will show:** only fixed messages for a short code in the URL (`?error=expired`),
  never text taken from the URL, and never Auth's own error text (`authFailure` translates it).
- **The one machine caller:** `/api/jobs/daily` accepts `Authorization: Bearer <CRON_SECRET>`, compared in
  constant time. The secret (service) key lives only in `data/supabase/admin.ts` and `data/auth-admin.repository.ts`.

## Environments

| Environment | Where | Database | Configuration |
|---|---|---|---|
| Local | your machine | Docker Supabase (`supabase start`), loaded with the demo seed (`supabase/seed.sql`, generated by `supabase/seed/build_seed.py`; invented people, real public prices) | `web/.env.development.local`, `.env` |
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
| CoinGecko | Top-250 market list and ranks (engine), live prices (web) | `engine/.../data/coingecko.py`, `web/src/integrations/coingecko/` (response parsed with zod, 4 second timeout); stored prices are read by `data/prices.repository.ts` | Live value falls back to daily closes; the engine run fails and retries next day |
| CoinMetrics | BTC price and MVRV | `engine/.../data/coinmetrics.py` | The engine run fails; nothing saved changes |
| Discord | Posts (buy-ins, trades, the rebuy window, Sunday standings) | `web/src/integrations/discord/` | Posts are released and retried on the next daily run. At the time of writing (2026-09-28) `DISCORD_WEBHOOK_URL` is not set in Vercel, so no posts go out |
| Google OAuth | Sign-in | Supabase Auth | Email sign-in still works |

## Backup and restore

There is no backup of members' data today: the Supabase project is on the free plan. Market data can
be rebuilt by the engine; baskets and trades cannot. This is [exception 11](exceptions.md); the
procedure, and what is and is not recoverable, is in
[runbooks/restore-database.md](runbooks/restore-database.md).
