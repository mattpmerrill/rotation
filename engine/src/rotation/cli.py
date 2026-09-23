"""`rotation` command line. Data fetch commands for Phase 0; backtest/daily come later."""

from __future__ import annotations

import logging
from datetime import date
from typing import Annotated

import typer
from dotenv import load_dotenv

from rotation.config import load_config
from rotation.data import backfill, binance_archive, coinmetrics, http, universe

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


if __name__ == "__main__":
    app()
