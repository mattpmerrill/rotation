"""`rotation` command line. Data fetch commands for Phase 0; backtest/daily come later."""

from __future__ import annotations

import logging
from datetime import date
from typing import Annotated

import typer
from dotenv import load_dotenv

from rotation.config import load_config
from rotation.data import (
    backfill,
    binance_archive,
    cache,
    coinmetrics,
    derivs,
    http,
    market,
    prices,
    universe,
)

app = typer.Typer(no_args_is_help=True)
fetch = typer.Typer(no_args_is_help=True, help="Download market data into the Parquet cache.")
app.add_typer(fetch, name="fetch")

load_dotenv()


@app.command()
def config() -> None:
    """Validate config/ and print the config hash."""
    cfg = load_config()
    typer.echo(f"rules v{cfg.rules.version} ok, hash {cfg.config_hash}")


@fetch.command("btc-onchain")
def fetch_btc_onchain() -> None:
    """BTC market cap + MVRV from CoinMetrics (free)."""
    with http.client() as c:
        df = coinmetrics.fetch_btc_onchain(c)
    typer.echo(
        f"coinmetrics btc: {len(df)} days, {df['date'].min():%Y-%m-%d} → {df['date'].max():%Y-%m-%d}"
    )


@fetch.command("binance")
def fetch_binance(
    symbols: Annotated[list[str], typer.Argument(help="e.g. BTCUSDT ETHUSDT")],
    klines: bool = True,
    funding: bool = True,
    oi: bool = typer.Option(False, help="Open interest: one request per day, slow."),
    oi_start: str = typer.Option("", help="YYYY-MM-DD; default = first available"),
) -> None:
    """Spot daily klines, perp funding and (optionally) open interest from the Binance archive."""
    with http.client() as c:
        for sym in symbols:
            parts = []
            if klines:
                df = binance_archive.fetch_spot_klines(c, sym)
                parts.append(f"klines {0 if df is None else len(df)}")
            if funding:
                df = binance_archive.fetch_funding(c, sym)
                parts.append(f"funding {0 if df is None else len(df)}")
            if oi:
                start = date.fromisoformat(oi_start) if oi_start else None
                df = binance_archive.fetch_open_interest(c, sym, start=start)
                parts.append(f"oi {0 if df is None else len(df)}")
            typer.echo(f"{sym}: " + ", ".join(parts) + " days")


@app.command("backfill")
def backfill_cmd(
    limit: Annotated[int | None, typer.Option(help="Only fetch N coins (for testing)")] = None,
    workers: int = 8,
) -> None:
    """One-time CoinGecko history for every active and dead coin (needs a paid key). Resumable."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    backfill.run(limit=limit, workers=workers)


@app.command("ranks")
def ranks_cmd() -> None:
    """Point-in-time top-N ranks from the backfill; writes an exclusion audit CSV."""
    ranked = universe.build_ranks()
    top = ranked[ranked["rank"] <= 100]
    typer.echo(
        f"ranks: {ranked['date'].nunique()} days, {top['coin_id'].nunique()} coins ever top 100"
    )


@app.command("prices")
def prices_cmd() -> None:
    """Build the price panel: CoinMetrics where validated, CoinGecko otherwise."""
    import pandas as pd

    ranked = cache.read("universe", "ranks")
    coins = set(ranked["coin_id"]) | {"bitcoin"}
    cg = backfill.load()
    cg = cg[cg["coin_id"].isin(coins)]
    meta = pd.read_parquet(cache.data_dir() / backfill.DATASET / "_coins.parquet")
    symbols = dict(zip(meta["id"], meta["symbol"], strict=True))
    with http.client() as c:
        cm = coinmetrics.fetch_prices(c, coinmetrics.price_assets(c))
    mapping = prices.match_coinmetrics(cm, cg, {k: symbols[k] for k in coins if k in symbols})
    panel = prices.build_panel(cg, cm, mapping)
    cache.write(panel, "universe", "prices")
    cache.write(
        pd.DataFrame(sorted(mapping.items()), columns=["asset", "coin_id"]), "universe", "cm_map"
    )
    share = (panel["source"] == "coinmetrics").mean()
    typer.echo(
        f"prices: {len(mapping)} coins on CoinMetrics, {share:.0%} of rows; {len(panel)} rows"
    )


@app.command("derivs")
def derivs_cmd() -> None:
    """Map Binance perps to coins (price-validated), then fetch funding for all of them."""
    import pandas as pd

    logging.basicConfig(level=logging.WARNING)
    panel = cache.read("universe", "prices")
    meta = pd.read_parquet(cache.data_dir() / backfill.DATASET / "_coins.parquet")
    coins = set(panel["coin_id"])
    symbols = {k: v for k, v in zip(meta["id"], meta["symbol"], strict=True) if k in coins}
    fmap = derivs.build_map(panel, symbols)
    typer.echo(f"futures map: {len(fmap)} symbols -> {fmap['coin_id'].nunique()} coins")
    funding = derivs.fetch_funding_all(fmap)
    typer.echo(f"funding: {funding['coin_id'].nunique()} coins, {len(funding)} coin-days")


@app.command("oi")
def oi_cmd(workers: int = 16) -> None:
    """Daily open interest for mapped perps on top-100 days (resumable, ~170k files)."""
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(message)s")
    fmap = cache.read("universe", "futures_map")
    needed = derivs.oi_days_needed(fmap, cache.read("universe", "ranks"))
    typer.echo(f"oi: {len(needed)} symbols, {sum(map(len, needed.values()))} days")
    derivs.fetch_oi(needed, workers=workers)
    oi = derivs.combine_oi(fmap)
    typer.echo(f"oi done: {oi['coin_id'].nunique()} coins, {len(oi)} coin-days")


@app.command("market")
def market_cmd() -> None:
    """Daily market frame: dominance, altseason, breadth, memes, funding, MVRV inputs."""
    m = market.build_market()
    typer.echo(f"market: {len(m)} days, {m.index.min():%Y-%m-%d} -> {m.index.max():%Y-%m-%d}")


@app.command("report")
def report_cmd() -> None:
    """Run every Phase 0 experiment; write docs/backtests/phase0-report.md + charts."""
    from rotation.backtest import report

    typer.echo(f"report: {report.build()}")


@app.command("load")
def load_cmd(
    since: Annotated[str, typer.Option(help="First date of alt prices to load")] = "",
    dry_run: bool = False,
) -> None:
    """Upsert the cache into Supabase (SUPABASE_DB_URL). Backtests don't need this."""
    import pandas as pd

    from rotation.config import get_config
    from rotation.data import loader

    since = since or str((pd.Timestamp.now() - pd.Timedelta(days=400)).date())
    tables = loader.prepare(get_config(), since)
    for name, df in tables.items():
        typer.echo(f"{name}: {len(df)} rows")
    if not dry_run:
        typer.echo(f"loaded: {loader.load(tables)}")


if __name__ == "__main__":
    app()
