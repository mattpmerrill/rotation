"""The BTC cycle rules the daily job and the research share: the halving clock and the features."""

import numpy as np
import pandas as pd

from rotation.rules.cycle import SellRules, clock_tranche_days, cycle_features

HALVING = pd.Timestamp("2020-01-01")


def cycle(n_up=560, n_down=400, n_flat=300, top=100.0):
    """Price climbs to `top` (day 560: inside the 500-580 sell window), crashes 80% over
    n_down days, then recovers slowly."""
    up = np.linspace(10, top, n_up)
    down = np.linspace(top, top * 0.2, n_down)
    flat = np.linspace(top * 0.2, top * 0.5, n_flat)
    idx = pd.date_range(HALVING, periods=n_up + n_down + n_flat)
    return pd.Series(np.r_[up, down, flat], index=idx)


def feats(prices, mvrv=2.0):
    return cycle_features(prices, pd.Series(mvrv, index=prices.index), [HALVING])


def test_clock_tranches_are_spread_over_the_window():
    r = SellRules(1 / 3, 450, 630, clock_share=1.0, clock_tranches=4, trend_weekly_sma=20)
    assert clock_tranche_days(r) == [450, 495, 540, 585]


def test_features_have_no_lookahead():
    p = cycle()
    full = feats(p)
    cut = feats(p.iloc[:700])
    cols = ["drawdown", "days_since_ath", "days_since_halving", "weekly_below_sma"]
    pd.testing.assert_frame_equal(full.iloc[:700][cols], cut[cols])


def test_mvrv_lag_is_bridged_for_up_to_three_days():
    p = cycle()
    mv = pd.Series(2.0, index=p.index)
    mv.iloc[-2:] = np.nan  # publication lag on the last two days
    mv.iloc[100:110] = np.nan  # a long gap stays a gap
    f = cycle_features(p, mv, [HALVING])
    assert f["mvrv"].iloc[-1] == 2.0
    assert f["mvrv"].iloc[109] != f["mvrv"].iloc[109]  # NaN
