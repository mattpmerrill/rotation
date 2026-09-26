"""Buy timing: BTC per BTC from a buy day to the next sell window."""

import numpy as np
import pandas as pd

from rotation.backtest.buy_timing import FEE, entry_results, in_btc, sell_windows

IDX = pd.date_range("2020-01-01", periods=40)
BTC = pd.Series(100.0, index=IDX)


def test_sell_windows_follow_each_halving():
    w = sell_windows([pd.Timestamp("2020-01-01")], (10, 12))
    assert w[0] == (pd.Timestamp("2020-01-11"), pd.Timestamp("2020-01-13"))
    assert len(w) == 2  # plus the estimated next halving


def test_a_coin_that_doubles_against_btc_returns_2x_less_fees():
    px = pd.DataFrame({"up": np.r_[np.full(10, 1.0), np.full(30, 2.0)]}, index=IDX)
    r = entry_results(in_btc(px, BTC), IDX[[0, 30]], [(IDX[20], IDX[25])])
    assert r.at[IDX[0], "up"] == 2 * (1 - FEE) ** 2
    assert np.isnan(r.at[IDX[30], "up"])  # no window after day 30 in the data


def test_dead_coins_are_worth_nothing_and_unborn_coins_have_no_result():
    px = pd.DataFrame(
        {
            "dead": np.r_[np.full(5, 1.0), np.full(35, np.nan)],
            "late": np.r_[np.full(15, np.nan), np.full(25, 1.0)],
        },
        index=IDX,
    )
    r = entry_results(in_btc(px, BTC), IDX[[0]], [(IDX[20], IDX[25])])
    assert r.at[IDX[0], "dead"] == 0
    assert np.isnan(r.at[IDX[0], "late"])
