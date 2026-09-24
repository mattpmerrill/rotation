import numpy as np
import pandas as pd
import pytest

from rotation.rules.indicators import higher_lows, rsi, sma, swing_lows, weekly_close


def _s(values, start="2024-01-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values)), dtype=float)


def test_sma_needs_full_window():
    s = sma(_s([1, 2, 3, 4]), 3)
    assert np.isnan(s.iloc[1]) and s.iloc[2] == 2 and s.iloc[3] == 3


def test_rsi_extremes_and_known_value():
    assert rsi(_s(range(1, 40)), 14).iloc[-1] == 100.0
    assert rsi(_s(range(40, 1, -1)), 14).iloc[-1] == pytest.approx(0.0)
    # alternating +1/-1 moves balance out near 50
    alt = _s(np.cumsum([1, -1] * 30) + 100)
    assert 40 < rsi(alt, 14).iloc[-1] < 60


def test_weekly_close_is_sunday_and_drops_partial_week():
    s = _s(range(10), start="2024-01-01")  # Mon 1 Jan .. Wed 10 Jan
    wk = weekly_close(s)
    assert list(wk.index) == [pd.Timestamp("2024-01-07")]  # the Sunday
    assert wk.iloc[0] == 6


def test_swing_low_is_reported_only_after_confirmation():
    s = _s([5, 4, 3, 2, 3, 4, 5, 6])
    lows = swing_lows(s, window=2)
    assert lows.dropna().index[0] == s.index[3 + 2]  # low on day 3, known on day 5
    assert lows.dropna().iloc[0] == 2


def test_higher_lows():
    #          low 2 (day 3)        low 3 (day 9)
    s = _s([5, 4, 3, 2, 3, 4, 5, 4, 3.5, 3, 4, 5, 6, 7])
    hl = higher_lows(s, window=2, lookback=90, min_lows=2)
    assert not hl.iloc[9] and hl.iloc[-1]
    falling = _s([5, 4, 3, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5])
    assert not higher_lows(falling, 2, 90, 2).iloc[-1]
