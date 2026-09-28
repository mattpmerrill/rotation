# Contributing

The rules for changing this repo, for people and coding agents alike. The structure is
explained in [docs/architecture.md](docs/architecture.md); product decisions are logged in
[docs/PLAN.md](docs/PLAN.md) and engineering decisions in [docs/decisions/](docs/decisions/). The
engineering rules themselves are the
[GetLatest engineering standards](https://github.com/get-latest/company/tree/main/engineering);
[AGENTS.md](AGENTS.md) is their digest, and [docs/enforcement-matrix.md](docs/enforcement-matrix.md)
says which of them a tool checks and which are still only intentions.

## Set up

```sh
# once per clone: install the pre-push and commit-msg hooks
git config core.hooksPath .githooks

# runtimes: Node 22 (see .nvmrc) and uv (which installs Python 3.12 for the engine)

# database (needs Docker)
supabase start                     # local Postgres + Auth; applies every migration
supabase test db                   # the access and fairness tests

# engine
cp .env.example .env               # CoinGecko key; SUPABASE_DB_URL for the daily job
cd engine && uv sync && uv run pytest

# web app
cd web && npm install
# web/.env.development.local: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, and the
# publishable and secret keys from `supabase status`
npm run dev
```

Local users: create them in the local Studio or with the Auth admin API, then
`update profiles set is_member = true where ...` to let them in.

## The checks (all must pass before a push)

One command runs everything: `node scripts/check.mjs`. It is what the pre-push hook runs, so a
push that fails it is refused. Bypassing the hook with `--no-verify` is an exception: record it
(see below).

| Part | What it runs |
|---|---|
| web | `npm run check` (lint incl. layer rules and the literal-value rule, prettier, types, the import graph, the filename and env guards, unit tests) and `npm run build` |
| engine | `uv run ruff check`, `ruff format --check`, `mypy`, `rotation config`, `pytest` |
| database | `supabase test db` (needs Docker; the script says so loudly when it skips it) |
| browser | `npm run e2e` in `web/`, or `node scripts/check.mjs --e2e`: Playwright and axe, signed-out pages |

CI runs the same checks on every push, plus the browser tests, the generated-types check, secret
and dependency scans, and (after a deploy) a smoke test against production. CI is the detector,
not the gate: a red run on `main` is a production problem, so fix forward or revert before
starting other work.

## Rules

**Where code goes**

1. Challenge rules and math go in `web/src/domain`, as pure functions with tests. If a page or
   action computes something about money, it belongs there instead.
2. Anything that talks to Supabase, Discord or env goes in `web/src/data`.
3. A new screen or capability is a new folder in `web/src/features`. Features don't import each
   other; `app/` composes them.
4. `app/` files stay thin: check access, call one query, render components.
5. Market data and research belong in the engine. The engine never reads people's data.

**Database**

6. Every schema change is a new file in `supabase/migrations/` (never edit one that's been
   applied to production). Name it `YYYYMMDDHHMMSS_what_it_does.sql`. The local filenames match
   production's migration history exactly; check with `supabase db push --dry-run`, which must say
   "Remote database is up to date" once a change is applied.
7. Grants are explicit in the migration (`anon`, `authenticated`, `service_role`); don't rely on
   project defaults. Every table has RLS on.
8. A new access or fairness rule gets a pgTAP test in `supabase/tests/database/`.
9. After a schema change, `cd web && npm run db:types` and commit the regenerated types.
10. Fairness rules are enforced in the database and mirrored in `domain/` for friendly
    messages. Keep the two in step (`domain/rules.ts` names the migration).

**Config and research**

11. Every threshold lives in `config/`. A change gets a `version` bump and a line in
    `docs/CHANGELOG-RULES.md`, then `uv run rotation web-data` and `uv run rotation buy-timing`
    to refresh the web app's copies.
12. Research goes in `engine/src/rotation/backtest/` with a generated report in
    `docs/backtests/`. Say what it found in plain words, including when an idea didn't work.

**Privacy**

13. Discord never shows amounts or holdings: names, coins and BTC multiples only.
14. Secrets stay in `.env`, Vercel and GitHub secrets. Never in code, logs or commits.

**Style**

15. Match the code around you. Comments say why, not what. Names are the words a person using
    the app would use (entry, basket, buy-in, rebuy).
16. UI copy is plain and specific, sentence case, no jargon. Errors say what happened and what
    to do. Use the design tokens in `globals.css`, not raw colors.
17. Keep it small. No new dependency, layer or abstraction without a reason written in the
    commit message.

## Commits and deploys

- One coherent change per commit. The subject is `<area>: <what changed>` (`web: add the health
  endpoint`), the body says why, and no em-dash or en-dash appears anywhere (the `commit-msg`
  hook refuses them). An exception to a rule goes in the commit as
  `Exception: <rule> - <why> - expires YYYY-MM-DD`, or in `docs/exceptions.md` if it outlives the
  commit.
- Trunk is production. `main` is the only long-lived branch and a push to it deploys through
  Vercel's Git integration (verified 2026-09-28: every push has a Production deployment built from
  that commit). The gate is the local check and the pre-push hook. A short-lived branch is fine to
  try something risky; it is deleted once it has answered the question.
- Apply database migrations first (`supabase db push`), then push the code that needs them, and
  make schema changes backward compatible (expand and contract), so rolling back the code is safe.
- After a push, watch CI and the post-deploy check to the end, then check that `/api/health`
  reports the pushed commit. To roll back: [docs/runbooks/rollback-deployment.md](docs/runbooks/rollback-deployment.md).
- Record product decisions in `docs/PLAN.md` (the decisions table) and hard-to-reverse engineering
  decisions as an ADR in `docs/decisions/`.
