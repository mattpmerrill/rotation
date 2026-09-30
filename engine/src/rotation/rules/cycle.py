"""BTC cycle harvest (Matt, 2026-09-24): sell a large slice of the stack near the cycle
top into USDT, and deploy it back into BTC near the bear-market bottom. Goal: more BTC
each cycle, and no more round trips.

Everything here is a pure function of daily data up to day t (no look-ahead):
  btc      daily close
  mvrv     CoinMetrics MVRV ratio
  halvings the halving dates (known in advance; the next one is predictable to ~weeks)

Why timing + trend instead of valuation thresholds: MVRV at the top fell every cycle
(4.72, 4.43, 2.85, 2.29), so fixed thresholds that caught 2017 missed 2025 entirely.
The halving clock (tops 525-546 days after the last three halvings) and the trend break
after a top do not depend on how big the cycle is.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from rotation.config import Cycle
from rotation.rules.indicators import sma, weekly_close

HALVING_INTERVAL_DAYS = 1456  # ~210,000 blocks at 10 min; real intervals ran 1,319-1,461 days


@dataclass(frozen=True)
class SellRules:
    window_start_days: int  # after the halving
    window_end_days: int
    clock_tranches: int
    trend_weekly_sma: int  # weekly SMA used for the trend-break feature


@dataclass(frozen=True)
class BuyRules:
    start_days_since_ath: int  # begin deploying this long after the last ATH...
    start_drawdown: float  # ...or once BTC is this far below its ATH...
    start_mvrv_below: float  # ...or MVRV drops below this
    tranches: int
    spacing_days: int
    deadline_days_since_ath: int  # deploy whatever is left by then: never sit out a bull


def rules_from_config(c: Cycle) -> tuple[SellRules, BuyRules]:
    """c: config.Cycle (the `cycle:` section of rules.yaml)."""
    return SellRules(**c.sell.model_dump()), BuyRules(**c.buy.model_dump())


def cycle_features(
    btc: pd.Series, mvrv: pd.Series, halvings: list[pd.Timestamp], weekly_sma: int = 20
) -> pd.DataFrame:
    """Daily inputs the rules need, each computed from data up to that day only."""
    f = pd.DataFrame(index=btc.index)
    f["btc"] = btc
    # CoinMetrics publishes MVRV about a day after price: carry the last value up to 3 days
    f["mvrv"] = mvrv.reindex(btc.index).ffill(limit=3)
    ath = btc.cummax()
    f["ath"] = ath
    f["drawdown"] = 1 - btc / ath
    is_ath = btc >= ath
    last_ath = pd.Series(btc.index, index=btc.index).where(is_ath).ffill()
    f["days_since_ath"] = (btc.index - pd.DatetimeIndex(last_ath)).days
    hs = pd.DatetimeIndex(sorted(halvings))
    last_h = [hs[hs <= t].max() if (hs <= t).any() else pd.NaT for t in btc.index]
    f["last_halving"] = pd.DatetimeIndex(last_h)
    f["days_since_halving"] = (btc.index - f["last_halving"]).dt.days
    wk = weekly_close(btc)
    below = (wk < sma(wk, weekly_sma)).reindex(btc.index, method="ffill").fillna(False)
    f["weekly_below_sma"] = below & (
        pd.DatetimeIndex(btc.index).dayofweek == 6
    )  # only on the weekly close
    return f


def clock_tranche_days(r: SellRules) -> list[int]:
    """Days after the halving on which the clock tranches sell, evenly spread."""
    span = r.window_end_days - r.window_start_days
    return [
        r.window_start_days + round(i * span / r.clock_tranches) for i in range(r.clock_tranches)
    ]


def buy_started(row: pd.Series, r: BuyRules) -> bool:
    return bool(
        row["days_since_ath"] >= r.start_days_since_ath
        or row["drawdown"] >= r.start_drawdown
        or (not np.isnan(row["mvrv"]) and row["mvrv"] < r.start_mvrv_below)
    )
