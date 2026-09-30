# Contributing

How to set up, check and ship a change. The rules for what code goes where, and what must never
be committed, are in [AGENTS.md](AGENTS.md) and are not repeated here. How the system fits together
is in [docs/architecture.md](docs/architecture.md).

## Set up

Requires Node 22 (see `.nvmrc`), [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for the
engine) and Docker for the local database.

```sh
git config core.hooksPath .githooks     # once per clone: pre-push gate and commit-message hook

supabase start                          # local Postgres and Auth; applies every migration
supabase db reset                       # loads the demo seed (supabase/seed.sql)

cd engine && uv sync && cd ..           # the engine
cd web && npm install                   # the app
```

Point the app at the local stack: create `web/.env.development.local` from `web/.env.example` with
the URL and keys from `supabase status`, then `cd web && npm run dev`. The demo people, their
password and the environment variables are listed in the [README](README.md#local-setup).

The engine needs a CoinGecko key and a database URL only for the daily job; see the root
`.env.example`.

## The check

One command runs everything: `node scripts/check.mjs`. It is what the pre-push hook runs, so a push
that fails it is refused. Bypassing the hook with `--no-verify` is an exception and gets recorded
(see [AGENTS.md](AGENTS.md)).

| Part     | What it runs                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------ |
| web      | `npm run check` (lint with layer and token rules, prettier, types, import graph, guards, unit tests) and `npm run build` |
| engine   | `ruff check`, `ruff format --check`, `mypy`, `rotation config`, `pytest` against an empty cache  |
| database | `supabase test db` (needs `supabase start`; the script says so when it skips)                    |

Add `--require-db` to fail instead of skipping the database step, `--e2e` for the Playwright and
axe browser tests, and `--signed-in` for the signed-in journey against the local Supabase. The
signed-in journey expects a freshly reset database: run `supabase db reset` first, because it
asserts on the `admin_actions` rows it creates.

CI runs the same checks on a clean Linux checkout, plus the generated-types check, secret and
dependency scans, and after a deploy a smoke test against production. CI is the detector, not the
gate: a red run on `main` is a production problem, so fix forward or revert before starting other
work.

## Commits and deploys

- One coherent change per commit, staged by path. The subject is `<area>: <what changed>`, the body
  says why, and there is no em-dash or en-dash anywhere (the `commit-msg` hook refuses it). An
  exception to a rule goes in the commit as `Exception: <rule> - <why> - expires YYYY-MM-DD`, or in
  [docs/exceptions.md](docs/exceptions.md) if it outlives the commit.
- Trunk is production. `main` is the only long-lived branch and a push to it deploys through
  Vercel's Git integration. The gate is the local check and the pre-push hook. A short-lived branch
  is fine to try something risky; delete it once it has answered the question.
- Apply database migrations first (`supabase db push`, `--dry-run` before), then push the code that
  needs them, and keep schema changes backward compatible so rolling back the code is safe.
- After a push, watch CI and the post-deploy check to the end, then confirm `/api/health` reports
  the pushed commit. To roll back: [docs/runbooks/rollback-deployment.md](docs/runbooks/rollback-deployment.md).
- Record product decisions in the table in [docs/PLAN.md](docs/PLAN.md) and hard-to-reverse
  engineering decisions as an ADR in [docs/decisions/](docs/decisions/).
