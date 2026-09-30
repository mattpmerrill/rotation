# Status: where we left off

A handoff for the next session (a person or an agent). It says what is live, what is open and who owns
it, what to do next and why, and how to get set up. It is a snapshot: the sources of truth are still
[PLAN.md](PLAN.md) (product decisions), [decisions/](decisions/) (engineering decisions),
[exceptions.md](exceptions.md) (known gaps, each with an expiry) and
[enforcement-matrix.md](enforcement-matrix.md) (what a tool checks). If this file and one of those
disagree, they win; fix this file.

**Snapshot: 2026-09-28.** The last change to the app is `176976c` (sign-up and approval, verified on
production); later commits only touch documentation and `scripts/check.mjs`. Production serves whatever
`/api/health` reports, and CI, the security scan and the post-deploy smoke test were green on the latest
commit when this was written. Run `git log --oneline -8` to see anything newer.

## What this project is

The **1 Bitty Challenge**: Matt and three friends each put up to 1 BTC into a basket of 2 to 8 alts, sell
near the top, rebuy BTC in the bear, and are scored in BTC. A Next.js 16 app on Vercel and Supabase, plus a
Python engine that refreshes market data daily. Live at https://rotation-web-seven.vercel.app. Repo:
`mattpmerrill/rotation` (public; Matt decided on 2026-09-30 to leave it public as it is and not rewrite history).

It is also a showcase of the GetLatest engineering standards (see
[ADR-001](decisions/ADR-001-adopt-engineering-standards.md)) applied to a small real app, done in phases. That is why so much of the work is guards, tests and docs.

## What is live

- The whole challenge app (leaderboard, picker with waiting slots, trade logging, charts, "best time to buy").
- **Sign-up and approval** ([ADR-006](decisions/ADR-006-signup-and-approval.md), runbook
  [adding-players.md](runbooks/adding-players.md)): a friend signs up with Google or name, email and password,
  waits on a screen that refreshes itself, and an admin approves on `/admin` ("People"). Forgotten password:
  the admin makes a one-time help link. Verified on production with a throwaway account (deleted).
- **Production Supabase auth settings** (changed 2026-09-28 through the Management API): email confirmation
  **off** (`mailer_autoconfirm: true`), minimum password length **10** (were `false` and `6`). Site URL and
  the redirect allowlist point at the production URL; Google sign-in is enabled. There is **no custom email
  service**, and Supabase's built-in sender only delivers to the organization's own team, which is why
  confirmation is off ([exception 17](exceptions.md)).
- **Admin:** Matt is the only admin, set with SQL. Admin status cannot be set through the app or the API.
- The daily job (GitHub Actions, 13:15 UTC) refreshes market data; the app's notification job posts to
  Discord **only once `DISCORD_WEBHOOK_URL` is set in Vercel (it is not, yet)**.

## Open items that need Matt

1. **Set `DISCORD_WEBHOOK_URL` in Vercel production.** Until then no Discord message goes out, including the
   "someone is waiting for approval" ping. Steps: Discord channel settings, Integrations, Webhooks, copy the
   URL; then `vercel env add DISCORD_WEBHOOK_URL production` (paste when prompted, never in chat) and redeploy.
   The first run will post any unannounced buy-ins and trades from the last three days. After it works, delete
   the now-unused GitHub secret of the same name.
2. **Try the Approve and Reject buttons with the first real friend.** They are covered by the signed-in
   browser journey (local Supabase, in CI) but nobody has used them on production; the production check
   approved a throwaway account with SQL because the button needs an admin session.
3. **Optional, when wanted: an email service** (a custom SMTP provider; the steps are in the runbook). It
   would allow email confirmation and reset emails and retire [exception 17](exceptions.md).
4. **Unverified:** `ANTHROPIC_API_KEY` and `DISCORD_BOT_TOKEN` sit in the local `.env` and nothing in the
   repo appears to use them. Not touched; check before deleting.

## What to do next, in the order I would do it

Everything below is in [enforcement-matrix.md](enforcement-matrix.md) under "Ranked by cost to fix"; this is
the recommended order and why.

1. **A scheduled dump of the user tables, then a restore drill** ([exception 11](exceptions.md)). There is
   **no backup of members' baskets and trades** (free Supabase plan), and friends are about to start adding
   real data. Market data is rebuildable; trades are not. This is the one item where waiting has a real cost.
   Sketch: a GitHub Actions workflow that runs `pg_dump` of `profiles`, `entries`, `entry_trades`,
   `admin_actions`, `challenges` with `SUPABASE_DB_URL`, stores it as an artifact (or in a private bucket)
   with a retention window, and a runbook step that restores it into a scratch project once.
2. **Structured logging with a correlation ID, and a failure alert** ([exception 3](exceptions.md)).
   `lib/log.ts` already writes one JSON line per event and `dbFailure` and `authFailure` already log with
   codes. Missing: a request ID created in `proxy.ts`, carried into every log line and into error responses,
   and an alert to Discord when the daily job fails or an unexpected error is logged (rate limited, so one
   failing job never sends hundreds of messages).
3. **BTC quantities as integer sats** ([ADR-003](decisions/ADR-003-btc-quantities-as-integer-sats.md),
   [exception 7](exceptions.md)). Touches most of `web/src/domain` and the components that show amounts. Do
   the domain tests first. `domain/types.ts` (`Balances`, `Trade`, `Entry`) and `data/trades.ts` /
   `data/entries.ts` (where a row becomes a domain object, and the one place to convert) are the core.
4. **The UI kit** ([ADR-002](decisions/ADR-002-design-kit.md), [exception 8](exceptions.md)): shadcn/ui and
   Motion, a `/design` page with a census test, four states, reduced motion. Start with the largest
   hand-built forms (`buy-in-form.tsx`, `trade-form.tsx`). The ESLint literal-value ratchet
   (`LITERALS_STILL_PRESENT` in `web/eslint.config.mjs`) lists 11 files that shrink as screens move over.
5. **The rest of the signed-in journey** ([exception 9](exceptions.md)): logging a trade, editing a basket,
   filling a slot, and axe on signed-in pages. The sign-up journey in `web/e2e/signed-in/` is the pattern.
6. **Security headers and CSP** ([exception 10](exceptions.md)); the site currently sends `X-Powered-By` and
   has HSTS but no CSP, frame or referrer headers.
7. **Clean-ups:** the unused `rules.yaml` sections, two unused tables and two old CoinGecko methods
   ([exception 16](exceptions.md), [ADR-004](decisions/ADR-004-archive-cycle-harvest-engine.md)); a
   `supabase/seed.sql` ([exception 18](exceptions.md)); Vercel's Preview scope pointing at the production
   database ([exception 15](exceptions.md)); schemas named `*.schema.ts` (the standards' convention; ours are
   plain `schema.ts` in `features/picker` and `features/trades`).

All 15 open exceptions expire between **2026-10-31 and 2026-12-31**; at an expiry, fix it or re-record it
with a new date and a reason. Exceptions 1, 2 and 6 are retired.

## How to resume

```sh
cd ~/Work/rotation
git pull
git config core.hooksPath .githooks       # once per clone: pre-push gate and commit-message hook
node scripts/check.mjs                    # the one command that runs every check (about 15 seconds)
```

- `node scripts/check.mjs --e2e` adds the signed-out browser tests. `--signed-in` adds the signed-in journey
  against a local Supabase and needs Docker and `supabase start`.
- The pre-push hook runs the same check. A push to `main` deploys to production (Vercel's Git integration).
  After a push, watch CI and the post-deploy check, then confirm `/api/health` reports the pushed commit.
- **Docker.** `supabase start` and `supabase stop` control the local stack (project id `rotation`);
  `supabase db reset` rebuilds it from the migrations.
- **Applying a migration to production:** write the migration and its pgTAP test, prove them first inside one
  transaction that is rolled back (a script using `psycopg` with `SUPABASE_DB_URL` from `.env`, running the
  migration and the test file, then rolling back; it was not kept in the repo), then `supabase db push`
  (use `--dry-run` first), then regenerate the types **with the pinned local CLI** (`npm run db:types`, needs
  Docker), then push the code. Never print the database URL.
- **Auth settings** are changed with `PATCH https://api.supabase.com/v1/projects/xtccrljmxtjmxbosczrd/config/auth`
  and `SUPABASE_ACCESS_TOKEN` (present in the shell environment); read them back with a `GET` and print only
  the fields you changed.

## Traps this project has already taught us

- The **production build** catches things the type checker, lint and unit tests do not (for example a
  `"use server"` file may export only `async function` declarations). Run the build, not just the tests.
- **macOS `grep` has no `\b`.** Scrub or search for words with `grep -w`. An earlier "clean" scrub was wrong
  because of this.
- **Generated types must come from the pinned local CLI** (2.115.0). The remote generator
  (`--project-id`) is a newer version and its output fails CI's stale-types check.
- **Engine tests must pass with an empty `ROTATION_DATA_DIR`**: CI has no research cache, your laptop does.
  `scripts/check.mjs` runs them that way.
- In Playwright use **`localhost`, not `127.0.0.1`**: the auth cookie is host-specific and Next redirects to
  `localhost`. Next also has its own empty `role="alert"` element (use the `notice()` helper).
- **Port 3100 is Tailscale**; the browser tests use 3187.
- **The database step of the check** runs only when Docker is up *and* `supabase start` has been run; if the
  stack is down it says so and skips (CI runs it anyway). Use `--require-db` to make that a failure. It once
  failed a push because the script only tested for Docker, which is now fixed.
- Supabase's **local** database keeps its own migration history. It went stale when the migrations were
  renamed to match production; `supabase db reset` fixes it.
- The **CI database job pulls images from a rate-limited registry** and can fail with `toomanyrequests`; the
  type-generation and `supabase start` steps retry. A re-run is safe.

## What was not verified

- Logging a trade, editing a basket and filling a slot have been tested with the data layer mocked and by
  the type checker and build, but never end to end against a real database.
- The Approve, Reject, Remove and Sign-in help link buttons on production (see open item 2).
- The Discord ping (the webhook is not set).
- The runbooks other than the parts marked in [adding-players.md](runbooks/adding-players.md): rollback,
  restore and credential rotation are all untested.

## Working agreements (from Matt)

- Pushing straight to `main` is fine for this project; the gate is the local check and the hook.
- Commit subjects are `<area>: <what changed>`, no em-dash or en-dash anywhere in a message (a hook
  enforces it). Say what was and was not verified, and report failures as failures.
- Never put amounts or holdings in Discord messages, and never commit holdings, account type, secrets or
  friends' names. Names in fixtures are generic.
- Credentials live in the credential store and the runtime only (the configuration standard),
  never in chat, commits or logs.

## Where things are

| You want | Go to |
|---|---|
| The product and its decisions | [PLAN.md](PLAN.md) |
| How it is built, the auth model, deployment | [architecture.md](architecture.md) |
| Why an engineering choice was made | [decisions/](decisions/) (ADR-001 to ADR-006) |
| Every known gap and its expiry | [exceptions.md](exceptions.md) |
| What a tool actually checks, and the ranked to-do list | [enforcement-matrix.md](enforcement-matrix.md) |
| Who it is for, its surfaces and quality targets | [system-context.md](system-context.md) |
| What to do when something breaks or someone joins | [runbooks/](runbooks/) |
| The rules for changing the repo | [../CONTRIBUTING.md](../CONTRIBUTING.md), [../AGENTS.md](../AGENTS.md) |

By the numbers, measured 2026-09-28: 200 web unit tests, 47 engine tests (46 plus one skipped without the
cache), 74 database tests, 28 signed-out and 9 signed-in browser tests; CI jobs `engine`, `web`, `e2e`,
`signed-in`, `database`, plus `security` and `post-deploy`; 6 ADRs, 5 runbooks, 15 open exceptions.
