# ADR-004: Archive the cycle-harvest research engine

- **Status**: Accepted
- **Date**: 2026-09-28
- **Owner**: Matt Merrill

## Context

Phase 0 (2026-09-23 to 09-25) built a rule engine and simulator for a different product: a BTC
core with an alt sleeve on the halving clock, later a "cycle harvest" strategy. The app was
rebuilt on 2026-09-26 as the 1 Bitty Challenge only (`docs/PLAN.md`, decision 13), and the
tables that supported the old plan were dropped. The engine's research modules, their tests and
a tracked scratch script stayed in `engine/`, "tested and switched off".

[deprecation.md](https://github.com/get-latest/company/blob/main/engineering/standards/deprecation.md)
is clear: dead code is deleted, not kept behind a flag, and a live surface that nothing needs is
maintenance, security and comprehension cost. Git keeps the history.

## Decision

- The engine keeps what the challenge and the daily job use: market data (CoinMetrics,
  CoinGecko, cache), the daily job, the config loader, and the research that feeds the web app
  (`web-data`, `buy-timing`, `challenge-exits`).
- The cycle-harvest engine (its simulator, rules, signal, reports, explorer, and their tests and
  CLI commands) is removed from the working tree. It is preserved in git under the tag
  `archive/cycle-harvest-2026-09-28`, and in the written studies under `docs/backtests/`,
  which stay as the record of what was found.
- Removal is verified, not assumed: the web app's generated data files are rebuilt before and
  after and must be identical, and the engine's tests, lint and type check pass.
- The engine's package layout (`data`, `rules`, `backtest`) is **not** restructured into the
  standard's `domain/application/infrastructure/workers/api` tree. It is a research and
  market-data package with one scheduled entry point, not an application backend, and a rename
  would add risk to code whose output feeds the live app for no behavioural gain. This is the
  recorded deviation from [python.md](https://github.com/get-latest/company/blob/main/engineering/stack/python.md).
- The engine is type-checked in CI, tested, linted and formatted like production code.

## Alternatives considered

- **Keep it, switched off.** The status quo. It costs tests, lint, type-check time and reader
  attention, and half of it is stale against the current product.
- **Move it to `engine/archive/` or a `legacy/` folder.** The standards forbid an archive
  directory inside the source tree, and a folder is a worse archive than a git tag.
- **Delete without a tag.** Git history would still hold it, but a tag makes it findable.

## Consequences

Easier: a smaller engine, a type checker that can be strict on what remains, and no code that
implies a strategy the app no longer offers.

Harder: reviving the old research means checking out the tag. The written studies remain, but
their code is no longer runnable from `main`.

## Migration or rollback implications

Rollback is `git checkout archive/cycle-harvest-2026-09-28 -- engine/`. Nothing in the database
depends on the removed modules (the tables were dropped on 2026-09-26).
