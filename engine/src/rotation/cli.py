"""`rotation` command line: the daily market job, the data cache, and the research that feeds the web app."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

import typer
from dotenv import load_dotenv

from rotation.config import load_config
from rotation.data import backfill, cache, coinmetrics, http, prices, universe

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


@app.command("daily")
def daily_cmd() -> None:
    """Daily market job: market_state + today's prices to Supabase (the app reads them)."""
    import os

    from rotation import daily
    from rotation.config import get_config
    from rotation.data.btc_features import live_features
    from rotation.data.loader import normalize_dsn

    cfg = get_config()
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        raise typer.BadParameter("SUPABASE_DB_URL is not set")
    f = live_features(cfg.rules.cycle)
    state, priced = daily.run(cfg, f, datetime.now(UTC).date(), normalize_dsn(dsn))
    typer.echo(
        f"market state {state.day}: BTC ${state.btc_price:,.0f}, "
        f"{state.drawdown:.0%} below the high, rebuy window {'open' if state.rebuy_window_open else 'closed'}; {priced} coins priced"
    )


@app.command("challenge-exits")
def challenge_exits_cmd() -> None:
    """Research: exit rules for a challenge basket -> docs/backtests/challenge-exits.md."""
    from rotation.backtest import challenge_exits

    typer.echo(challenge_exits.write())


@app.command("buy-timing")
def buy_timing_cmd() -> None:
    """Research: when buying alts paid off -> docs/backtests/buy-timing.md + the app's data."""
    from rotation.backtest import buy_timing

    for out in buy_timing.write():
        typer.echo(out)


@app.command("web-data")
def web_data_cmd() -> None:
    """Static data the web app ships with: the picker's history and the reference dates."""
    from rotation import web_data

    for out in web_data.write():
        typer.echo(f"web data: {out} ({out.stat().st_size / 1e3:,.0f} kB)")


if __name__ == "__main__":
    app()
