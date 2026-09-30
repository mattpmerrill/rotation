# AGENTS.md

The contract for anyone (person or coding agent) changing this repo. It is self-contained. When a
rule here conflicts with a habit, the rule wins. Vocabulary: **MUST** / **MUST NOT** are
non-negotiable and block the push; **SHOULD** needs a written reason to skip.

## Before you write code

- Read [docs/architecture.md](docs/architecture.md), the [ADRs](docs/decisions/) and
  [docs/status.md](docs/status.md) (where the last session stopped and what is open).
- Product decisions are in [docs/PLAN.md](docs/PLAN.md). Do not reverse one without the owner.
- This is Next.js 16, which differs from older versions. Read `web/AGENTS.md` and check
  `web/node_modules/next/dist/docs/` before using a Next API.
- Match the surrounding code. Put new code where it belongs; do not restructure to make a change
  fit.
- Do not change the framework, runtime, package manager, validation library or test framework as a
  side effect. That needs an ADR.
- Understand a failure before you fix it, and say what you checked. Evidence comes before any claim
  that something works.

## Non-negotiables

- **Layers.** In `web/src`: `app -> features -> data -> domain -> lib`, plus `ui` and
  `integrations`. ESLint enforces the direction and dependency-cruiser blocks cycles. Do not
  disable a rule to make code pass; move the code. Do not weaken a lint, type, security or test
  rule to make an unrelated change pass.
- **Handler, service, repository.** Every request that reaches data goes
  `route or action -> service -> repository -> database`. The handler does transport and auth, the
  service is the use case, the repository (`data/<thing>.repository.ts`) is the only place a query
  is built.
- **No business logic in UI.** Not in `page.tsx`, `layout.tsx`, `route.ts` or components. Logic
  lives in `domain` (pure rules) or a feature service, and a page reads: access check, one feature
  query, render.
- **One owner per concept.** One module owns a concept's type, values and rules; everything else
  imports it. Do not re-declare a union, a literal array or a "narrowed copy". A database row is not
  a domain model: map it at the repository.
- **Zod at every trust boundary.** Forms, params, request bodies, env vars, the engine's JSON files
  and external (CoinGecko) responses are validated at runtime. Types are not validation. Anything
  that crosses the TypeScript and Python boundary has a schema that both sides check.
- **RLS is authoritative.** Every exposed table has policies. An access change ships an allow test
  **and** a deny test. Re-check auth in every Server Action and Route Handler; the proxy is not the
  authorization boundary. Verify identity with `getClaims()`, never the unverified session user.
- **Types.** `strict` on, no `any` (use `unknown` and narrow), no non-null `!` except after an
  invariant check. Use discriminated unions for state. A type assertion (`as`) in non-test code
  carries a comment that names the boundary it crosses. Never hand-edit generated database types;
  regenerate them.
- **Errors are values.** Expected failures return an `ApplicationResult` with a stable `code`.
  Unexpected ones throw and are logged. Never swallow an error or turn every error into `null`: a
  failed read throws. Never show users a stack trace, SQL, a provider payload or Auth's own error
  text.
- **Secrets stay server-side.** The secret Supabase key, `CRON_SECRET` and the Discord webhook URL
  are read only through `web/src/data/env.ts` and never imported into client code. `NEXT_PUBLIC_`
  means public. Only `data/env.ts` reads `process.env` (ESLint refuses it elsewhere). Never commit
  `.env*` except the `.env.example` files, and never log secrets, tokens or personal data.
- **External calls.** One adapter per vendor in `web/src/integrations`; vendor types never leave it.
  Timeout every call, validate the response, retry only idempotent transient operations with
  bounded backoff, make writes idempotent.
- **Data.** Constraints in the database enforce invariants (ownership, ranges, uniqueness), not only
  app code. Timestamps are `timestamptz` in UTC. Migrations live in version control and breaking
  changes are expand-then-contract.
- **Tokens-only styling.** Colors, radii, shadows and z-indexes come from the design tokens in
  `web/src/app/globals.css`. No hex values or raw palette classes in components (lint refuses
  them).
- **Accessibility.** WCAG 2.2 AA: semantic HTML, keyboard and focus, visible focus rings, contrast
  from the tokens, honor `prefers-reduced-motion`. Every screen handles loading, empty and error.
  Destructive actions ask for confirmation.
- **Security headers.** The Content-Security-Policy is built per request in `web/src/proxy.ts`
  (`features/security`); the static headers are in `web/next.config.ts`. A change to what the page
  loads (a new image host, script or connection) updates the policy in the same commit, and
  `e2e/security-headers.spec.ts` must still pass.
- **Python (engine).** Annotate function signatures (mypy is in the check), timezone-aware
  datetimes, no bare `except`, no notebooks as production code.

## Project: the 1 Bitty Challenge

**Purpose.** A small web app for a private group. Each member swaps up to 1 BTC into a basket of 2
to 8 alts, sells near the top for USDT and rebuys BTC in the bear. Everyone is scored in BTC: BTC
out divided by BTC in. The app shows where everyone stands and never tells anyone when to trade. It
is also a public portfolio project, so structure and tests should be exemplary.

**File map**

| Path                              | What it holds                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `web/src/app`                     | Routes only (pages, layouts, route handlers, `globals.css`)                                     |
| `web/src/features/*`              | Vertical slices: auth, admin, entry, leaderboard, picker, picks, timing, trades, notifications, security, health |
| `web/src/domain`                  | Pure rules and money math: valuation, standings, buy-in plan, waiting slots, timing verdict     |
| `web/src/data`                    | `<thing>.repository.ts` files, env, Supabase clients, failure translation, access guards        |
| `web/src/integrations`            | One adapter per vendor: `coingecko`, `discord`                                                  |
| `web/src/lib`                     | Generic helpers: days, formatting, `ApplicationResult`, logger, security header builder         |
| `web/src/ui`                      | Presentational components and chart primitives                                                  |
| `web/src/generated`               | Files the engine writes. Do not edit by hand                                                    |
| `web/e2e`                         | Playwright specs: signed-out pages, axe, security headers, the signed-in journey                |
| `engine/`                         | Python: daily market data, research and backtests, static data for the web app                  |
| `config/`                         | Research thresholds (`rules.yaml`) and the coin universe (`universe.yaml`)                      |
| `supabase/`                       | Migrations, pgTAP tests, the demo seed                                                          |
| `docs/`                           | Architecture, plan, ADRs, exceptions, enforcement matrix, runbooks, research reports            |
| `scripts/`                        | `check.mjs`, the one command that runs every check                                              |

Each folder in `web/src` has a short README with what belongs there and what it may import.

**Vocabulary.** Use these words in code, UI and docs.

- **Challenge**: one run of the game. At most one is open; it ends when every entry is back in BTC.
- **Entry**: one person's run in a challenge.
- **Basket**: the 2 to 8 coins an entry holds.
- **Buy-in**: the day an entry swaps BTC into its basket (up to 1 BTC).
- **Waiting slot**: a basket pick that stays in BTC until the person fills it with a coin.
- **Fill**: buying the coin for a waiting slot.
- **Sell**: selling coins for USDT. **Rebuy**: turning USDT back into BTC.
- **Standings**: entries ranked by BTC now against BTC put in.

**Commands**

| Command                                                   | What it does                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `node scripts/check.mjs`                                  | Every check below (what the pre-push hook runs)                     |
| `node scripts/check.mjs --require-db --e2e --signed-in`   | The same, plus the browser tests and the signed-in journey; needs Docker and `supabase start` |
| `cd web && npm run dev`                                   | Dev server                                                          |
| `cd web && npm run check`                                 | Lint (layers, tokens), format, types, import graph, guards, unit tests |
| `cd web && npm run build`                                 | Production build                                                    |
| `cd web && npm run e2e`                                   | Playwright (signed-out pages, axe, headers); builds first           |
| `cd web && npm run db:types`                              | Regenerate `database.types.ts` from the local database              |
| `cd web && npm run screenshots`                           | Retake `docs/screenshots` against the demo seed                     |
| `cd engine && uv run pytest`                              | Engine tests (also ruff, mypy; `rotation config` validates the YAML) |
| `supabase test db`                                        | pgTAP access and fairness tests (needs Docker)                      |

**Testing philosophy.** Test what can break in ways that matter: domain rules (valuation, buy-in
plans, slot shares, the timing verdict), the services (every failure code), adapters (against a
scripted `fetch`) and access rules (RLS allow and deny, in pgTAP). Do not write trivial tests that
restate the code. A bug fix ships a regression test that failed before the fix. A database change
ships a migration, regenerated types and a pgTAP test. A new critical workflow ships a happy-path
and a failure-path browser test.

**Comment philosophy.** Explain why, not what. If a comment restates the next line, delete it.
Name the constraint, the trade-off or the surprise.

**Definition of Done.** `node scripts/check.mjs` is green after your last edit, migrations and
generated types are current, required tests exist, no secret is exposed, and the change has a safe
deploy and rollback path. Say what you ran and what you could not run, and say when a UI change was
not looked at in a browser. Do not call work done when it is only committed locally: a push to
`main` deploys to production, so the gate is before the push.

If you cannot meet a MUST, do not skip it quietly. Record it in
[docs/exceptions.md](docs/exceptions.md) with a reason and an expiry, or in the commit as an
`Exception:` line, or stop and ask. [docs/enforcement-matrix.md](docs/enforcement-matrix.md) lists
which rules a tool checks and which are still only intentions.

### Non-negotiables specific to this repo

- **Fairness rules live in the database and are mirrored in `domain/`.** The 1 BTC cap, basket
  size, no overselling and slot shares are enforced by `check_entry_trade` and the functions in
  `supabase/migrations`, and mirrored in `web/src/domain` so a person gets a message they can act
  on. Keep the two in step; `domain/rules.ts` names the migration.
- **Schema changes are new migrations** named `YYYYMMDDHHMMSS_what_it_does.sql`, with explicit
  grants and RLS on, and a pgTAP test in `supabase/tests/database`. Never edit a migration that has
  been applied to production. Apply migrations before the code that needs them and keep them
  backward compatible. Regenerate `web/src/data/database.types.ts` after a change.
- **Every Server Action starts with `requireMember()`** (or `requireAdmin()`): actions are
  reachable by direct POST.
- **Privacy.** Discord messages show names, coins and BTC multiples, never amounts or holdings.
  The repo is public: never commit anyone's holdings, account type, real names in fixtures, or any
  secret. Seeds, fixtures and screenshots use generic names.
- **Thresholds live in `config/`.** A change gets a `version` bump and a line in
  `docs/CHANGELOG-RULES.md`, then `uv run rotation web-data` and `uv run rotation buy-timing` to
  refresh the web app's copies. Research goes in `engine/src/rotation/backtest/` with a generated
  report in `docs/backtests/` that says what it found in plain words, including when an idea did not
  work. The engine never reads people's data, and the web app never writes market data.
- **Commit subjects are `<area>: <what changed>`.** The body says why. No em-dash or en-dash
  anywhere in the message (the `commit-msg` hook refuses it). Stage files by path. Run
  `git config core.hooksPath .githooks` once per clone.
- **Product copy is plain and specific,** sentence case, no jargon. Errors say what happened and
  what to do. "Joi's top picks" is a product name (PLAN decision 22); keep it.
