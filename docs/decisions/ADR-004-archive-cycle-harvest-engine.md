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

The deprecation standard is clear: dead code is deleted, not kept behind a flag. Git keeps the history.

The first draft of this ADR said the simulator, rules and signal would all go. Computing the real
import graph showed that is not possible without breaking live code: the daily job and the
challenge research still use the halving clock, the BTC cycle features and a few shared helpers
that lived inside the old strategy's modules.

## Decision

**Removed** (everything not reachable from the daily job, `web-data`, `buy-timing`,
`challenge-exits`, `load` and the CoinGecko and CoinMetrics data commands): the cycle simulator
and study (`cycle_sim`, `cycle_study`), the position, score and market rules, the Binance archive
and derivatives fetchers, the alt-harvest, basket-lab, benchmark, experiment, explorer and report
modules, the `signal` module and its Discord command, the portfolio package, the Strategy Explorer
page, `scratch_top5.py`, eight test files and the commands that ran them. Preserved in git under the
tag `archive/cycle-harvest-2026-09-28`. The written studies, charts and CSVs of that engine
(`cycle-harvest.md`, `phase0-report.md`, their images and data files) were removed from `main` on
2026-09-28 too, because their titles and tables encode the owner's starting stack; they are in the
tag as well. `docs/backtests/` keeps the two studies behind the challenge (`buy-timing`,
`challenge-exits`).

**Kept, because live code needs them**:

- `rules/cycle.py` and `rules/indicators.py`: the halving clock and BTC cycle features that the daily
  job uses to decide whether the rebuy window is open.
- `backtest/btc_cycle.py` (new): the three things the surviving research took from `cycle_study`
  (the halving dates, the reports folder, BTC's cycle features). `data/btc_features.py` (new) holds
  `live_features`, which the daily job took from `signal`.

**Verified, not assumed**: the web app's generated data (`basket-history.json`, `buy-timing.json`,
`market-reference.json`) and the two research reports were rebuilt from the untouched code before
the removal and again after every change, and are identical apart from the `generated` date. The
rewritten `cycle_features` is frame-identical to the old one on synthetic edge cases and on the live
5,916-row BTC history. The config hash is unchanged.

**Engine quality gates**: the engine is now type-checked (mypy) in CI, alongside ruff and pytest.
`cache.read` raises a clear error for a missing file instead of returning `None` that 16 call sites
then indexed; `read_if_exists` keeps the optional case. Two research modules suppress three pandas
stub error codes in `pyproject.toml` with the reason written beside it.

**Not restructured**: the package layout (`data`, `rules`, `backtest`) does not become the
standard's `domain/application/infrastructure/workers/api` tree. The engine is a research and
market-data package with one scheduled entry point, not an application backend, and a rename would
add risk to code whose output feeds the live app for no behavioural gain. This is the recorded
deviation from the Python standard.

## Follow-ups this leaves (each is its own change)

- **Unused config.** Seventeen `rules.yaml` sections (universe rules, score, entry, buckets,
  positions, ladder, routing, time stop, rotation, leverage, regime, flags, euphoria actions,
  portfolio, rebalance, breakers, backtest) and their models in `config.py` have no reader left; only
  the `cycle` section and `version` are used. `rotation load` also stores the whole rules object in
  `config_versions`. Removing
  them changes the recorded config hash, so it needs a `version` bump and a line in
  `docs/CHANGELOG-RULES.md` (CONTRIBUTING rule 11).
- **Unused database tables.** `rotation load` still writes `exchange_symbols` and
  `derivatives_daily` from a Binance cache that nothing can rebuild any more, and no app code reads
  them. Dropping them is a migration and a decision about the data.
- **Two unreferenced methods** on the CoinGecko client (`ping`, `fetch_history`), older than this
  change.

## Alternatives considered

- **Keep it, switched off.** The status quo. It costs tests, lint, type-check time and reader
  attention, and half of it was stale against the current product.
- **Move it to `engine/archive/` or a `legacy/` folder.** The standards forbid an archive directory
  inside the source tree, and a folder is a worse archive than a git tag.
- **Delete without a tag.** Git history would still hold it, but a tag makes it findable.
- **Also untangle the halving-clock code from the old rules module.** Renaming `rules/cycle.py` for
  a cleaner story would touch the daily job for no behavioural gain; the module is small and used.

## Consequences

Easier: a smaller engine (32 Python files, down from 55), a type checker that runs clean,
and no code that implies a strategy the app no longer offers.

Harder: reviving or reading the old research means checking out the tag; neither its code nor its
studies are on `main`.

## Migration or rollback implications

Rollback is `git checkout archive/cycle-harvest-2026-09-28 -- engine/`. Nothing in the database
depends on the removed modules (the tables that did were dropped on 2026-09-26).
