"""Indicator primitives. Pure functions of a date-indexed Series; no look-ahead:
every value at date t uses only data up to and including t."""

from __future__ import annotations

import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    """Simple moving average; NaN until n values exist."""
    return s.rolling(n, min_periods=n).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    """Wilder's RSI (the standard one): smoothed with alpha = 1/n."""
    delta = s.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = gain / loss
    out = 100 - 100 / (1 + rs)
    return out.where(loss != 0, 100.0).where(gain.notna())


def weekly_close(s: pd.Series) -> pd.Series:
    """Sunday UTC closes (a crypto week ends Sunday 23:59 UTC). Partial weeks dropped."""
    wk = s.resample("W-SUN").last()
    return wk[wk.index <= s.index.max()]


def swing_lows(s: pd.Series, window: int) -> pd.Series:
    """Confirmed swing lows: a close that is the lowest within `window` days either side.
    A low is only known `window` days later, so it is reported on the confirmation date
    (no look-ahead). Returns the low's value on its confirmation date, NaN elsewhere."""
    span = 2 * window + 1
    centered_min = s.rolling(span, center=True, min_periods=span).min()
    is_low = s == centered_min
    lows = s.where(is_low)
    return lows.shift(window)


def higher_lows(s: pd.Series, window: int, lookback: int, min_lows: int) -> pd.Series:
    """True when the last `min_lows` confirmed swing lows within `lookback` days are each
    higher than the one before."""
    lows = swing_lows(s, window).dropna()
    if len(lows) < min_lows:
        return pd.Series(False, index=s.index)
    rising = (lows.diff() > 0).astype(float).rolling(min_lows - 1).min() == 1
    if min_lows == 1:
        rising = pd.Series(True, index=lows.index)
    # date of the oldest low in the group; the whole group must sit inside the lookback
    oldest = pd.Series(lows.index, index=lows.index).shift(min_lows - 1)
    rising_ff = rising.reindex(s.index).ffill().fillna(False).astype(bool)
    oldest_ff = oldest.reindex(s.index).ffill()
    within = (s.index.to_series() - oldest_ff) < pd.Timedelta(days=lookback)
    return rising_ff & within.fillna(False)


def pct_change_over(s: pd.Series, days: int) -> pd.Series:
    """Change vs the value `days` calendar rows earlier (daily series)."""
    return s / s.shift(days) - 1
