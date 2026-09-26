# Instructions for coding agents

This repo is the 1 Bitty Challenge: a small web app where friends each swap up to 1 BTC into an
alt basket and compete on BTC at the end. Before changing code:

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (what goes where) and
   [CONTRIBUTING.md](CONTRIBUTING.md) (the rules). They are binding.
2. Read [docs/PLAN.md](docs/PLAN.md) for the current decisions. Don't reverse one without Matt.
3. In `web/`, also read `web/AGENTS.md`: Next.js 16 differs from older versions; check
   `web/node_modules/next/dist/docs/` before using an API.

Non-negotiables:

- Respect the layers (`app → features → data → domain → lib`, plus `ui`). ESLint enforces
  them; don't disable the rule, move the code.
- Money math lives in `web/src/domain` with tests. Fairness rules live in the database too.
- Schema changes are new migrations with explicit grants and pgTAP tests.
- Run the checks in CONTRIBUTING.md before saying something is done, and say what you ran.
- Never put amounts in Discord messages, or secrets anywhere in the repo.
