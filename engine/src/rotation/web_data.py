"""Static data the web app ships with: `rotation web-data`.

market-reference.json (web/src/generated/) holds the dates the app shows as references,
straight from config/rules.yaml: the halvings, the old sell window, the bear rebuy rule.

basket-history.json powers the basket picker's "how would this have done" preview. For
each of the two cycles the alt data covers, it holds weekly (Sunday) BTC closes and each
coin's weekly price in BTC, from 600 days after that cycle's halving to 700 days after the
next one. The app picks the entry week matching today's point in the cycle and averages
the chosen coins' lines, so any basket previews instantly in the browser.

Coins: today's top N by market cap (the backtest's ranking). Prices in BTC are scaled so
each coin's first known week is 1000, and rounded to 4 significant figures: the preview
only needs ratios, and this keeps the file small.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path

import pandas as pd

from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.indicators import weekly_close
from rotation.signal import HALVING_INTERVAL_DAYS

OUT = REPO_ROOT / "web" / "public" / "data"
GENERATED = REPO_ROOT / "web" / "src" / "generated"
FROM_DAYS = 600  # history starts this long after a halving: covers entries from here on
TO_DAYS = 700  # ...and runs this long past the next halving: covers the sell window


def _sig(x: float, digits: int = 4) -> float | None:
    if x is None or not math.isfinite(x) or x <= 0:
        return None
    return round(x, digits - 1 - math.floor(math.log10(abs(x))))


def basket_history(top_n: int = 150) -> dict:
    halvings = [pd.Timestamp(h) for h in get_config().rules.cycle.halvings]
    px = cache.read("universe", "prices")
    ranks = cache.read("universe", "ranks")
    latest = ranks["date"].max()
    top = ranks[ranks["date"] == latest].nsmallest(top_n, "rank")["coin_id"].tolist()
    wide = px[px["coin_id"].isin([*top, "bitcoin"])].pivot_table(
        index="date", columns="coin_id", values="price_usd"
    )
    meta = pd.read_parquet(cache.data_dir() / "coingecko_backfill" / "_coins.parquet")
    names = meta.set_index("id")[["symbol", "name"]]

    cycles = []
    for h, nh in pairwise(halvings[1:4]):
        span = wide.loc[h + pd.Timedelta(days=FROM_DAYS) : nh + pd.Timedelta(days=TO_DAYS)]
        weekly = span.apply(weekly_close)
        btc = weekly.pop("bitcoin")
        coins = {}
        for c in top:
            if c not in weekly:
                continue
            in_btc = weekly[c] / btc
            first = in_btc.first_valid_index()
            if first is None:
                continue
            coins[c] = [_sig(v) for v in (in_btc / in_btc[first] * 1000).tolist()]
        cycles.append(
            {
                "halving": str(h.date()),
                "next_halving": str(nh.date()),
                "weeks": [str(d.date()) for d in weekly.index],
                "btc_usd": [_sig(v, 6) for v in btc.tolist()],
                "coins": coins,
            }
        )
    return {
        "generated": datetime.now(UTC).strftime("%Y-%m-%d"),
        "ranks_as_of": str(latest.date()),
        "coins": {
            c: {"symbol": str(names.at[c, "symbol"]).upper(), "name": str(names.at[c, "name"])}
            for c in top
            if c in names.index
        },
        "cycles": cycles,
    }


def market_reference() -> dict:
    cfg = get_config()
    c = cfg.rules.cycle
    return {
        "config_hash": cfg.config_hash,
        "halvings": [str(h) for h in c.halvings],
        "halving_interval_days": HALVING_INTERVAL_DAYS,
        "sell_window_days": [c.sell.window_start_days, c.sell.window_end_days],
        "rebuy": {
            "days_since_high": c.buy.start_days_since_ath,
            "drawdown": c.buy.start_drawdown,
            "mvrv_below": c.buy.start_mvrv_below,
        },
    }


def write() -> list[Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    history = OUT / "basket-history.json"
    history.write_text(json.dumps(basket_history(), separators=(",", ":")) + "\n")
    reference = GENERATED / "market-reference.json"
    reference.write_text(json.dumps(market_reference(), indent=2) + "\n")
    return [history, reference]
