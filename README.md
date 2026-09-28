# Rotation: the 1 Bitty Challenge

How many BTC can we get from one? Friends each swap up to 1 BTC into a basket of alts, sell
near the top, and rebuy BTC in the bear. Scored in BTC.

- The plan and decisions: [docs/PLAN.md](docs/PLAN.md)
- How it's built: [docs/architecture.md](docs/architecture.md)
- How to work on it: [CONTRIBUTING.md](CONTRIBUTING.md) (one command runs every check: `node scripts/check.mjs`)
- Engineering decisions, known gaps and what is enforced: [docs/decisions/](docs/decisions/),
  [docs/exceptions.md](docs/exceptions.md), [docs/enforcement-matrix.md](docs/enforcement-matrix.md)
- Who it is for and what it assumes: [docs/system-context.md](docs/system-context.md). When something
  breaks: [docs/runbooks/](docs/runbooks/)

| Folder | What |
|---|---|
| `web/` | The app (Next.js on Vercel) |
| `supabase/` | Database schema, access rules and tests |
| `engine/` | Market data job, research and backtests (Python) |
| `config/` | Research thresholds and the coin universe |
| `docs/` | Plan, architecture, research reports |
