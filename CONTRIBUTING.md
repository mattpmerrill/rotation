# Contributing

The rules for changing this repo, for people and coding agents alike. The structure is
explained in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); decisions are logged in
[docs/PLAN.md](docs/PLAN.md).

## Set up

```sh
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

## The checks (all must pass before a commit)

| Part | Command |
|---|---|
| web | `npm run check` (lint incl. layer rules, prettier, types, unit tests) and `npm run build` |
| engine | `uv run ruff check src tests && uv run ruff format --check src tests && uv run pytest` |
| database | `supabase test db` |

CI runs all three on every push and pull request.

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
   applied to production). Name it `YYYYMMDDHHMMSS_what_it_does.sql`.
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

- Small commits with a message that says what and why. Branch for anything risky.
- `main` deploys: Vercel builds `web/` on push. Apply database migrations first
  (`supabase db push`), then push the code that needs them.
- Record decisions that change the plan in `docs/PLAN.md` (the decisions table).
