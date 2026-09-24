"""Market-level rules: overheating flags (rule 10), regime (9), euphoria actions and
BTC rebuy (10), circuit breakers (11).

Input is one daily frame (date index) of market series:
  btc_close, btc_mcap, btc_realized_cap     (CoinMetrics)
  btc_dominance        percent, 0-100
  funding_btc, funding_eth                  8h-equivalent (NaN before perps existed)
  altseason_index      0-100: % of the top 50 alts beating BTC over 90 days
  memes_top20          count of meme coins among the top 20 alts
  breadth              0-1: share of the top-100 alts with ALT/BTC above its 50D SMA
  retail_mania         optional manual flag (bool)

Missing inputs make that flag False (never True), and `flags_unknown` lists them, so a
backtest over years without the data is labelled rather than silently optimistic.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from rotation.config import Breakers, EuphoriaActions, FlagRules, RegimeRules
from rotation.rules.indicators import rsi, sma, weekly_close

FLAGS = [
    "mvrv_z",
    "mayer",
    "funding",
    "altseason",
    "dominance_drop",
    "retail_mania",
    "memes",
    "weekly_rsi",
]


def mvrv_z(mcap: pd.Series, realized: pd.Series) -> pd.Series:
    """(market cap - realized cap) / std(market cap), std over all history up to t
    (expanding, so no look-ahead)."""
    return (mcap - realized) / mcap.expanding(min_periods=365).std(ddof=0)


def weekly_rsi_daily(close: pd.Series, n: int) -> pd.Series:
    """RSI of completed weekly closes, carried forward to each day of the next week."""
    wk = rsi(weekly_close(close), n)
    return wk.reindex(close.index, method="ffill")


def flags(m: pd.DataFrame, cfg: FlagRules) -> pd.DataFrame:
    close = m["btc_close"]
    out = pd.DataFrame(index=m.index)
    z = mvrv_z(m["btc_mcap"], m["btc_realized_cap"])
    out["mvrv_z_value"] = z
    out["mvrv_z"] = z > cfg.mvrv_z_above

    mayer = close / sma(close, 200)
    out["mayer_value"] = mayer
    out["mayer"] = mayer > cfg.mayer_multiple_above

    f = cfg.funding
    both = m[["funding_btc", "funding_eth"]].mean(axis=1, skipna=False)
    hot = (both > f.above_8h).astype(float).where(both.notna())
    out["funding"] = hot.rolling(f.persist_days, min_periods=f.persist_days).min() == 1

    out["altseason"] = m["altseason_index"] > cfg.altseason_index_above

    dom = m["btc_dominance"]
    out["dominance_drop"] = (dom - dom.shift(cfg.dominance_drop_days)) <= -cfg.dominance_drop_pts

    manual = (
        m["retail_mania"] if "retail_mania" in m else pd.Series(cfg.retail_mania, index=m.index)
    )
    out["retail_mania"] = manual.fillna(False).astype(bool)

    out["memes"] = m["memes_top20"] >= cfg.memes_in_top20_min

    wrsi = weekly_rsi_daily(close, cfg.rsi_period)
    out["weekly_rsi_value"] = wrsi
    out["weekly_rsi"] = wrsi > cfg.btc_weekly_rsi_above

    inputs = {
        "mvrv_z": z,
        "mayer": mayer,
        "funding": both,
        "altseason": m["altseason_index"],
        "dominance_drop": dom.shift(cfg.dominance_drop_days),
        "memes": m["memes_top20"],
        "weekly_rsi": wrsi,
    }
    unknown = pd.Series("", index=m.index)
    for name, series in inputs.items():
        unknown = unknown + series.isna().map({True: f"{name};", False: ""})
    out["flags_unknown"] = unknown

    out[FLAGS] = out[FLAGS].fillna(False).astype(bool)
    out["flag_count"] = out[FLAGS].sum(axis=1).astype(int)
    return out


def regime(
    m: pd.DataFrame,
    flag_count: pd.Series,
    cfg: RegimeRules,
    breaker_defend: pd.Series | None = None,
) -> pd.Series:
    """Weekly regime on Sunday closes, carried forward through the following week.
    First match wins, in cfg.order (euphoria, defend, expand, accumulate)."""
    close = m["btc_close"]
    s200 = sma(close, cfg.btc_sma_days)
    dom = m["btc_dominance"]
    breaker = (
        breaker_defend.reindex(m.index).fillna(False)
        if breaker_defend is not None
        else pd.Series(False, index=m.index)
    )
    cond = {
        "euphoria": flag_count >= cfg.euphoria_min_flags,
        "defend": (close < s200) & (s200 < s200.shift(cfg.btc_sma_slope_days)),
        "expand": (close > s200)
        & (dom < dom.shift(cfg.dominance_trend_days))
        & (m["breadth"] >= cfg.breadth_min),
        "accumulate": pd.Series(True, index=m.index),
    }
    daily = pd.Series(
        np.select([cond[r] for r in cfg.order], cfg.order, "accumulate"), index=m.index
    )
    daily = daily.where(s200.notna())  # no regime until the 200D SMA exists
    sundays = daily[daily.index.dayofweek == 6]
    weekly = sundays.reindex(m.index, method="ffill")
    # the -25% breaker forces Defend the same day, not at the next weekly close
    return weekly.mask(breaker.astype(bool), "defend")


def euphoria_tier(
    flag_count: pd.Series, btc_close: pd.Series, cfg: EuphoriaActions
) -> pd.DataFrame:
    """Which euphoria tier applies each day (0 = none), and whether the backstop fired.

    Backstop: a weekly close below the 20-week SMA while armed (3+ flags seen within the
    last `armed_weeks`). It triggers the top tier."""
    tiers = sorted(cfg.tiers, key=lambda t: t.min_flags)
    tier = pd.Series(0, index=flag_count.index)
    for i, t in enumerate(tiers, 1):
        tier[flag_count >= t.min_flags] = i

    b = cfg.backstop
    wk = weekly_close(btc_close)
    below = (wk < sma(wk, b.weekly_sma)).reindex(btc_close.index, method="ffill").fillna(False)
    seen = (flag_count >= b.after_min_flags).astype(int)
    armed = seen.rolling(b.armed_weeks * 7, min_periods=1).max() == 1
    backstop = below & armed & (btc_close.index.dayofweek == 6)
    tier[backstop] = len(tiers)
    return pd.DataFrame({"tier": tier, "backstop": backstop})


def rebuy_signal(btc_close: pd.Series, z: pd.Series, cfg: EuphoriaActions) -> pd.Series:
    """True while BTC is 50%+ below its all-time high and MVRV Z < 1."""
    r = cfg.rebuy
    dd = 1 - btc_close / btc_close.cummax()
    return (dd >= r.drawdown_from_ath) & (z < r.mvrv_z_below)


def breaker_levels(portfolio_value: pd.Series, cfg: Breakers) -> pd.Series:
    """0 = none, 1 = -15% from peak (close leverage, freeze entries), 2 = -25% (Defend)."""
    dd = 1 - portfolio_value / portfolio_value.cummax()
    return pd.Series(
        np.select([dd >= cfg.level_2.drawdown, dd >= cfg.level_1.drawdown], [2, 1], 0),
        index=portfolio_value.index,
    )
