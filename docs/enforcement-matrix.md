# Enforcement matrix

The audit of this repo against the engineering standards it follows ([ADR-001](decisions/ADR-001-adopt-engineering-standards.md)): for each rule area, what checks it, where that check runs, and whether it is running
today. A MUST with nothing behind it is an intention, and it is listed as one.

Status is **re-derived from the repo, not edited from memory** (the standards require it). Derived on
2026-09-28, after the first round of enforcement work. Update a row when the check behind it changes,
and re-derive the whole table when you touch this file.

## Status vocabulary

- **Automated**: a tool fails on it, in the local check, the hook or CI. Nobody has to remember.
- **Local only**: a tool checks it, but nothing runs it automatically.
- **Review**: checked by a person or an agent reading the diff. Real, not repeatable.
- **Unenforced**: stated as a MUST with nothing behind it. Each has an entry in [exceptions.md](exceptions.md).
- **Pending**: the check exists but has not run in CI yet. No row is Pending as of this run.

"Local check" means `node scripts/check.mjs`, which the pre-push hook runs.

## The matrix

| Rule area | Enforced by | Where it runs | Status |
|---|---|---|---|
| Type safety, compiler baseline (strict + 4 flags) | `tsc --noEmit` | local check, CI | Automated |
| No non-null assertions | ESLint `no-non-null-assertion` | local check, CI | Automated |
| Unsafe type assertions carry a reason | - | - | Unenforced (exception 5) |
| Lint | ESLint (Next config) | local check, CI | Automated |
| Formatting | `prettier --check` (web), `ruff format --check` (engine) | local check, CI | Automated (partial: root `scripts/` and workflows are not formatted by anything) |
| Unit tests | Vitest (200), pytest (47) | local check, CI | Automated |
| Component tests | - | - | Unenforced (exception 8) |
| Generated DB types match schema | `supabase gen types` diff, CLI pinned | CI `database` job | Automated (passed in CI on 2026-09-28; needs Docker, so not in the local check) |
| Layer and import boundaries | ESLint `no-restricted-imports` per layer; dependency-cruiser rules | local check, CI | Automated |
| No circular imports, no orphaned modules (web) | dependency-cruiser | local check, CI | Automated (web only; the engine has no dead-code check) |
| Domain and lib import no framework, database or Node built-ins | dependency-cruiser | local check, CI | Automated |
| Components never import `data/` | dependency-cruiser | local check, CI | Automated |
| Queries only inside `data/` | ESLint (pages) and dependency-cruiser (components); "every Supabase call is in `data/`" was verified by grep on 2026-09-28 | local check, CI | Automated (partial: no guard for a feature calling Supabase itself) |
| Handler, service, repository chain | - | - | Unenforced: every feature (`trades`, `picker`, `auth`, `admin`) follows it and no action calls the data layer (checked by grep on 2026-09-28), but nothing stops new code from skipping it. See "Migrating to the chain" below |
| One definition per domain concept | - | Review | Unenforced (no canonical-definitions guard) |
| Server-only modules out of client code | `server-only` import (Next build); dependency-cruiser | Vercel build, CI | Automated (partial) |
| Env parsed once, centrally | ESLint refuses `process.env` outside `data/env.ts` | local check, CI | Automated |
| `.env.example` lists every variable | `scripts/guards/env-example.mjs` | local check, CI | Automated |
| Runtime validation at trust boundaries | zod in actions and env; nothing checks new boundaries | Review | Review (known gap: `data/live.ts`, exception 4) |
| Typed result, stable error codes, no raw DB or Auth text to users | - | - | Unenforced: every feature returns `ApplicationResult`, `dbFailure` and `authFailure` translate and log, and no raw `error.message` reaches a user (grep, 2026-09-28); nothing stops a new one |
| Auth rechecked at every boundary | `requireMember()` convention; e2e proves every private route sends a signed-out visitor to sign in | CI | Review (partial: the signed-out gates are Automated) |
| RLS present on exposed tables | pgTAP `rls-is-on.test.sql`, against the catalogue | CI `database` job | Automated (passed in CI on 2026-09-28; the query was also checked against production: 12 of 12 tables) |
| RLS allowed and denied tests | pgTAP `challenge.test.sql` and `signup-approval.test.sql` (allowed and denied paths for every write and admin function): 74 tests across 3 files | local check (when Docker runs), CI `database` job | Automated (also run against production inside a rolled-back transaction before the migration was applied) |
| Clean DB reset from migrations | `supabase db start` replays every migration | CI `database` job | Automated |
| Migration history matches production | `supabase db push --dry-run` | manual | Local only (verified 2026-09-28: "Remote database is up to date") |
| Integration behaviour against a real DB | - | - | Unenforced |
| Production build | `next build` | local check, CI, Vercel | Automated |
| Critical E2E journeys | Playwright: 28 signed-out tests (desktop and phone) and a 9-step signed-in journey (sign up with email, wait, approval, admin-only page, neutral duplicate email, help link used once, rejection, audit trail) against the local Supabase | CI `e2e` and `signed-in` jobs; locally with `--e2e` and `--signed-in` | Automated (partial: the signed-in journey covers sign-up and approval, not yet logging a trade, editing a basket or filling a slot, exception 9) |
| Accessibility checks | axe at WCAG 2.2 AA, gated at serious and critical, plus a self-test | CI `e2e` job | Automated (passed in CI on 2026-09-28); partial: signed-out pages (exception 9) |
| No literal colours, radii, shadows, z-indexes | ESLint ratchet, 11 files listed | local check, CI | Automated (partial: spacing unchecked; the list only shrinks) |
| UI built from the `/design` kit | - | - | Unenforced (no `/design` page yet, exception 8) |
| Behavioural components from one headless library | - | - | Unenforced (exception 8) |
| Secret scanning | gitleaks 8.30.1, full history | CI `security` workflow, weekly | Automated (passed in CI on 2026-09-28; also clean locally: 57 commits, no leaks) |
| Dependency scanning | `npm audit` at high; `pip-audit` | CI `security` workflow, weekly | Automated (passed in CI on 2026-09-28) |
| Preview-environment smoke test | Substituted by the post-deployment check | - | Recorded exception (14) |
| Post-deployment smoke test | `post-deploy` workflow: waits for `/api/health` to report the pushed commit, then drives the suites against production | CI on every push to `main` | Automated (first run on 2026-09-28 waited for production to report `2c0bb30`, then passed) |
| Full check before push | `.githooks/pre-push` runs `scripts/check.mjs` | every push | Automated once per clone (`git config core.hooksPath .githooks`); refusal proven against a throwaway remote |
| Commit subject `<area>: <what>`, no em-dash or en-dash, Exception trailer format | `.githooks/commit-msg` (`commit-message.mjs`) | every commit | Automated once per clone (unit tested; every commit made on 2026-09-28 passes) |
| Files and folders kebab-case | `scripts/guards/filenames.mjs`; its exemption list is empty | local check, CI | Automated (the 42 legacy names were renamed on 2026-09-28) |
| One runtime version per language, pinned and matched by CI | `.nvmrc`, `engines`, `engine-strict`, `requires-python`; CI reads `.nvmrc` | install, CI | Automated |
| Python type checking | mypy (annotated functions, checked bodies) | local check, CI | Automated (two research modules suppress three pandas-stub error codes, in `pyproject.toml`) |
| Structured logs with a correlation ID | - | - | Unenforced (exception 3) |
| Alerts reach a channel a human reads | - | - | Unenforced (exception 3) |
| Security headers and CSP | - | - | Unenforced (exception 10) |
| Documented RPO and RTO, a backup, a tested restore | - | - | Unenforced (exception 11) |
| Rollback exercised once | - | - | Unenforced (runbook exists, untested) |
| Definition of Done walked | - | Review | Review |
| Exceptions recorded with an expiry | `docs/exceptions.md`, `Exception:` trailers (format checked) | Review | Review |
| A model quotes figures rather than deriving them | - | - | Not applicable (no model in the product) |

## What this says

Ten of the eleven CI quality gates in the engineering standards
run today: formatting, linting, type checking, unit tests (there are no component tests), a clean
database reset, the pgTAP tests, the production build, the browser tests, accessibility checks, and
secret and dependency scanning. The eleventh, the preview smoke test, is a recorded substitution by the
post-deploy check, which ran green against production on its first run. The generated-types check and the
RLS catalogue test also passed in CI. The local gate (pre-push and commit-msg hooks) is Automated once
per clone. The first CI run on 2026-09-28 passed every job except one, described below.

The two biggest remaining gaps are structural, and both are in [exceptions.md](exceptions.md): there
is no service layer between the Server Actions and the data layer (exception 1), and errors are free
text with no correlation ID or alerting (exceptions 2 and 3). Those are the next phase.

## What was found by adding these

Worth recording: a check earns its keep by what it finds on its first run.

- Turning on the four missing compiler flags found 101 errors, including a buy-in planner that would
  silently produce `NaN` for a coin with no price (unreachable from the UI today, because its one
  caller checks first), and a `Balances` type that let BTC and USDT be `undefined`.
- dependency-cruiser found `MarketState`, a domain concept, defined in the data layer so that two
  presentation components imported from `data/`. It moved to `domain/types.ts`.
- Typing the engine found that `cache.read` returned `None` for a missing file, and 16 call sites
  indexed the result without checking. It now raises an error that says where the file should be.
- The first CI run found a regression this pass introduced: a test used `cache.read(...) is None` to skip
  when the research cache is absent, and `cache.read` now raises. It passed on Matt's laptop, which has
  the cache, and failed on a clean checkout. `scripts/check.mjs` now runs the engine tests against an empty
  cache, so a local run cannot hide that again.
- Adding the trades service found two more defects of one class: `getEntry`, `findEntryFor` and
  `getCurrentChallenge` discarded the database error and returned `null`, so an outage read as "you
  don't own this basket" or "no challenge is open"; and `removeTrade(tradeId)` took an unvalidated
  number straight from a client component. Reads now throw, and the id is parsed with a schema.
- Moving the picker found the buy-in date window computed in three places (the action, `editWindow`
  and `getPickerData`), with its 30-day constant living in an input-schema file. It is now
  `RULES.buyInLookbackDays` with two pure, tested functions (`buyInWindow`, `editWindow`) in the domain.
  It also found two types both named `BuyInInput` (the planner's inputs and the submitted payload), and
  that an action argument was validated with a schema that quietly accepts the string `"7"`. Supabase's
  types turned out to handle the join the three `as unknown as` casts were working around.
- Building sign-up found that email registration could not work at all for friends: with no custom email
  service Supabase refuses to deliver to anyone outside the organization team. The production build caught
  a `"use server"` file exporting arrow functions, which the type checker, lint and unit tests all missed.
  The sign-in page reflected any `?error=` text from the URL (content spoofing), and `safeNextPath` let
  `/\evil.example` through. Docker finally running showed the local database was stale (it had recorded the
  pre-rename migration names), that pgTAP passes 74 tests, and that there is no `seed.sql` (exception 18).
- Comparing migration history found that production and the repo named the same eight migrations
  differently, so `supabase db push` would have tried to re-apply them.
- The import graph showed the "old strategy" engine could not be deleted as planned: the daily job
  depends on its halving clock. Removal was scoped to what is actually unreachable, and verified by
  rebuilding the app's data before and after.

## Migrating to the chain, by table

The standards migrate by table, so each pass retires the risk for a whole table. Measured 2026-09-28.

| Table | Repository | Service | State |
|---|---|---|---|
| `entry_trades` | `data/trades.ts` (the only place it is queried) | `features/trades/service.ts` | Done: 3 use cases, 24 tests for the service and actions (37 with the shared result, logging and failure-mapping tests) |
| `entries` | `data/entries.ts` (with `start_entry`, `edit_entry`, `delete_entry`) | `features/picker/service.ts` | Done: 3 use cases, 28 tests for the service and actions |
| `challenges` | `data/challenges.ts` | read by the picker service and `features/*/queries.ts` | Done |
| `profiles` | `data/viewer.ts` (own row), `data/people.ts` (admin functions) | `features/auth`, `features/admin/service.ts` | Done: sign-in, sign-up, approval, help links; 36 tests for the services, actions, callbacks and error codes |
| `admin_actions` | written only by the admin functions | read by admins through RLS | Done: allowed and denied pgTAP tests |
| `auth.users` | `data/auth.ts` (Supabase Auth), `data/auth-admin.ts` (secret key) | `features/auth/service.ts` | Done: Auth failures translated by `authFailure` |
| `coins`, `daily_prices`, `market_state` | `data/prices.ts`, `data/market.ts` | read-only, via `features/*/queries.ts` | Reads only; no rule to centralise |
| `notifications` | `data/notifications.ts` | `features/notifications/job.ts` | Already has one owner |

## Ranked by cost to fix

Roughly cheapest and most valuable first.

1. ~~Confirm the second CI run is green.~~ Done: every workflow has been green since, most recently on 2026-09-28.
2. ~~The kebab-case rename.~~ Done 2026-09-28: 42 files, 101 imports, the guard's list is empty.
3. ~~The service layer, and the typed result with stable error codes.~~ Done 2026-09-28 for `trades`, `picker`,
   `auth` and `admin`: exceptions 1 and 2 are retired.
4. **Structured logs, a correlation ID and a failure alert.** Retires exception 3.
5. **BTC quantities as integer sats in `domain/`** ([ADR-003](decisions/ADR-003-btc-quantities-as-integer-sats.md)).
6. **The UI kit, `/design` page and a census test** ([ADR-002](decisions/ADR-002-design-kit.md)). Retires
   exception 8 and shrinks the literal-values list.
7. **The rest of the signed-in journey**: logging a trade, editing a basket, filling a slot, and axe on
   signed-in pages. The sign-up and approval journey exists and runs in CI.
8. **Security headers and CSP.**
9. **A scheduled dump of the user tables**, then a restore drill. Retires exception 11.
10. **Trim the dead config, tables and secrets** left by the archive (exception 16).

## Keeping it honest

- **MUST**: a new MUST added to the standards or to this repo's rules states, in the same change, how it
  is enforced, or is added to this table as Unenforced.
- **MUST**: this table is re-derived from the repo, not edited from memory. A status carried forward
  without being rechecked is the failure mode the standards describe.
- **MUST**: a guard states what population it walks, and that population is checked against the tree
  when the tree changes. The filename guard walks `web/src`; the literal-value rule walks `web/src`
  TypeScript and TSX; the import-graph rules walk `web/src`. None of them walk `web/e2e`, `web/scripts`
  or the root `scripts/`.
