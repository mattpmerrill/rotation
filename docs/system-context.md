# System context

The assumptions the architecture depends on, as the
[engineering standards](https://github.com/get-latest/company/blob/main/engineering/standards/engineering-standards.md#system-context-and-constraints)
require. If one of these changes, the architecture may need to.

## Users and critical workflows

Primary users: Matt and three friends, each a member of one challenge.
Nobody else has access. Friends sign up on their own (with Google or an email and password) and wait
on a screen that refreshes itself until an admin approves them ([ADR-006](decisions/ADR-006-signup-and-approval.md)).

Critical workflows, in order of importance:

1. **Log a trade** (a sell or a rebuy). Wrong or lost trades corrupt the scoring.
2. **Start or edit a buy-in** (a basket of 2 to 8 coins, up to 1 BTC in, optional waiting slots).
3. **See the standings**: BTC out divided by BTC in, for every member, with the value chart.
4. **The daily job**: refresh market data, then post what is new to Discord.

## Surfaces

| Surface | Class | Notes |
|---|---|---|
| `/login`, `/auth/callback`, `/auth/confirm` | Public | Email and password, Google sign-in, and the one-time help link an admin makes |
| `/auth/reset` | Authenticated | Choose a new password after a help link |
| `/admin` | Administrative | The People page: approve, reject, remove, help links. Admins only (`profiles.is_admin`); anyone else gets the ordinary not-found page |
| `/`, `/entries/*`, `/pick`, `/picks`, `/timing` | Authenticated, members only | Non-members see a "not a member yet" screen |
| `/api/jobs/daily` | Internal | Bearer `CRON_SECRET`, called by GitHub Actions |
| Supabase Studio, SQL | Administrative | Matt only: making someone an admin, opening challenges |
| Discord channel | Internal | Outbound posts only |

## Tenancy

Single-tenant in practice: one group, one open challenge at a time. It is still built as
multi-user, with row-level security. Members read everyone's entries and trades in the challenge
(that is the product) and write only their own. Access derives from `auth.uid()` and
`profiles.is_member`, never from a client-supplied identifier.

## Sensitive data and obligations

- Trade logs and basket contents: visible to members by design, private from everyone else.
- **Matt's own holdings and account type are not part of the product** and must not be committed
  or posted. Discord shows names, coins and BTC multiples, never amounts (`docs/PLAN.md`, decision 10).
- Emails and password hashes live in Supabase Auth. No payment data. No regulated data. Not
  financial advice: the app tells nobody when to trade.
- Security level: **OWASP ASVS Level 2**, applied proportionately for a four-person app.

## Scale

Four members, one challenge at a time, a few hundred days of history, a few hundred trades. The
database is a few megabytes of user data plus market data for about 250 coins. Valuations are
computed on request in milliseconds. No concurrency concern beyond a handful of simultaneous
users.

## Explicitly unsupported

Public sign-up with self-serve membership, real-money custody or trading, price alerts telling
people when to buy or sell, more than one open challenge, light mode, native mobile apps,
right-to-left languages.

## Cost constraints

Runs on free tiers (Vercel Hobby, Supabase Free, GitHub Actions) plus a CoinGecko Demo key. The
CoinGecko Analyst plan was bought for one month for the historical backfill and cancelled. A
change that needs a paid plan needs Matt's decision first.

## Browsers and regions

Current evergreen browsers, desktop and phone. Supabase region: us-west-1. Members are in North
America.

## Quality targets

| Target | Value |
|---|---|
| Availability, critical workflows | Best effort. No committed monthly target: it is a hobby project on free tiers. |
| Recovery point objective (RPO) | Not met today: no backup of user data. Recorded in [exceptions.md](exceptions.md), expires 2026-10-31. |
| Recovery time objective (RTO) | Best effort, hours: redeploy from `main`, replay migrations, restore data if a dump exists. See [runbooks/restore-database.md](runbooks/restore-database.md). |
| Page latency | Server render under about 1 second for the dashboard at this scale. Measured only by eye today. |

## When a dependency is down

| Dependency | What the app does |
|---|---|
| Supabase | Pages error with the app's error screen; nothing is lost that was already saved. Writes fail visibly. |
| CoinGecko (live prices) | Live value falls back to the last daily closes in the database and the page says so. The daily engine run fails (red in GitHub Actions) and the next scheduled run tries again. |
| CoinMetrics (MVRV) | The daily engine run fails (red in GitHub Actions); nothing already saved changes, and the next scheduled run tries again. |
| Discord | The notification is released and retried on the next daily run; the app is unaffected. |
| Vercel | The app is down. Nothing else depends on it except the daily notification call. |
