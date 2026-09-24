"""Coin-level rules: universe gates (rule 1), entry score (rule 2), entry sizing.

Input is one coin's daily frame (date index) with columns:
  close        USD close
  btc_close    BTC USD close on the same dates
  volume_usd   daily volume
  rank         point-in-time rank (NaN when unranked)
optional:
  funding_8h   mean daily funding, 8h-equivalent (NaN = no perp market that day)
  oi_usd       end-of-day open interest in USD
  flow_flag    manual smart-money / catalyst flag (bool)
  exchanges    number of major exchanges listing it (live only)
  unlock_frac_90d, catalyst   (live only)

Live-only inputs are NaN in backtests; a NaN live-only gate passes and is reported
in `unknown_gates` so results can be labelled "degraded".
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from rotation.config import EntryRules, ScoreRules, UniverseRules
from rotation.rules.indicators import higher_lows, pct_change_over, sma

SCORE_POINTS = ["trend", "beating_btc", "location", "not_crowded", "flow"]


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df else pd.Series(np.nan, index=df.index)


def gates(df: pd.DataFrame, u: UniverseRules) -> pd.DataFrame:
    """One boolean column per gate plus `passes`. See docs/RULES.md section 1."""
    close = df["close"]
    ratio = close / df["btc_close"]
    out = pd.DataFrame(index=df.index)
    out["top_n"] = df["rank"] <= u.top_n
    out["volume"] = sma(df["volume_usd"], u.volume_avg_days) >= u.min_avg_daily_volume_usd
    first = close.first_valid_index()
    age = (df.index - first).days if first is not None else np.zeros(len(df))
    out["history"] = pd.Series(age, index=df.index) >= u.min_history_days
    hl = u.higher_lows
    out["altbtc"] = (ratio > sma(ratio, u.altbtc_sma_days)) | higher_lows(
        ratio, hl.swing_window, hl.lookback_days, hl.min_lows
    )

    exch = _col(df, "exchanges")
    unlock = _col(df, "unlock_frac_90d")
    catalyst = _col(df, "catalyst")
    out["exchanges"] = exch.isna() | (exch >= u.min_major_exchanges)
    out["unlock"] = unlock.isna() | (unlock < u.max_unlock_frac_90d)
    if u.require_catalyst:
        out["catalyst"] = catalyst.isna() | catalyst.fillna(False).astype(bool)
    else:
        out["catalyst"] = True
    out["unknown_gates"] = (
        exch.isna().map({True: "exchanges;", False: ""})
        + unlock.isna().map({True: "unlock;", False: ""})
        + catalyst.isna().map({True: "catalyst;", False: ""})
    )
    gate_cols = ["top_n", "volume", "history", "altbtc", "exchanges", "unlock", "catalyst"]
    out["passes"] = out[gate_cols].all(axis=1)
    out["passes_ex_altbtc"] = out[[c for c in gate_cols if c != "altbtc"]].all(axis=1)
    return out


def score(df: pd.DataFrame, r: ScoreRules) -> pd.DataFrame:
    """The five 0/1 points and `score` (0-5). See docs/RULES.md section 2."""
    close, vol = df["close"], df["volume_usd"]
    ratio = close / df["btc_close"]
    out = pd.DataFrame(index=df.index)

    out["trend"] = (close > sma(close, r.trend.fast_sma)) & (
        sma(close, r.trend.fast_sma) > sma(close, r.trend.slow_sma)
    )

    b = r.beating_btc
    out["beating_btc"] = (ratio > sma(ratio, b.sma)) & (ratio > ratio.shift(b.rising_lookback_days))

    loc = r.location
    near_sma = (close / sma(close, loc.sma) - 1).abs() <= loc.max_distance
    low = close.rolling(loc.support_lookback_days, min_periods=loc.support_lookback_days).min()
    near_support = close <= low * (1 + loc.support_max_distance)
    out["location"] = near_sma & near_support

    cr = r.crowding
    funding, oi = _col(df, "funding_8h"), _col(df, "oi_usd")
    oi_chg = pct_change_over(oi, 7)
    funding_ok = funding <= cr.max_funding_8h
    oi_ok = oi_chg.isna() | (oi_chg < cr.max_oi_change_7d)  # no OI history: funding alone
    no_perp = funding.isna()
    out["not_crowded"] = np.where(no_perp, cr.no_perp_market == "pass", funding_ok & oi_ok).astype(
        bool
    )

    fl = r.flow
    rising = sma(vol, fl.fast_days) > sma(vol, fl.slow_days)
    flag = _col(df, "flow_flag").fillna(False).astype(bool)
    out["flow"] = rising | flag

    out[SCORE_POINTS] = out[SCORE_POINTS].fillna(False).astype(bool)
    out["score"] = out[SCORE_POINTS].sum(axis=1).astype(int)
    return out


def initial_stop(df: pd.DataFrame, e: EntryRules) -> pd.Series:
    """2% below the 30-day low, but never more than 25% below the close."""
    close = df["close"]
    s = e.initial_stop
    low = close.rolling(s.lookback_days, min_periods=1).min() * (1 - s.buffer)
    return np.maximum(low, close * (1 - s.max_distance))


def target(df: pd.DataFrame, e: EntryRules) -> pd.Series:
    """Highest close of the last 365 days if above today's close, else +100%."""
    close = df["close"]
    hi = close.rolling(e.target.lookback_days, min_periods=1).max()
    return pd.Series(
        np.where(hi > close, hi, close * (1 + e.target.fallback_gain)), index=close.index
    )


def entry_plan(
    df: pd.DataFrame, scored: pd.DataFrame, r: ScoreRules, e: EntryRules
) -> pd.DataFrame:
    """stop, target, reward_risk, and size (1.0 full, 0.5 half, 0.0 pass)."""
    close = df["close"]
    out = pd.DataFrame(index=df.index)
    out["stop"] = initial_stop(df, e)
    out["target"] = target(df, e)
    risk = close - out["stop"]
    out["reward_risk"] = (out["target"] - close) / risk.where(risk > 0)
    size = np.select(
        [scored["score"] >= r.full_size_at, scored["score"] >= r.half_size_at], [1.0, 0.5], 0.0
    )
    out["size"] = np.where(out["reward_risk"] >= r.min_reward_risk, size, 0.0)
    return out
