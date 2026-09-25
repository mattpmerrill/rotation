"""The public brief: every step type worded as a share, never an amount."""

import numpy as np
import pandas as pd

from rotation.config import load_config
from rotation.daily import _done_this_cycle, public_brief, public_steps
from rotation.rules.cycle import cycle_features

CFG = load_config()
H = pd.Timestamp("2020-01-01")


def _f():
    p = np.r_[np.linspace(10, 100, 560), np.linspace(100, 20, 400), np.linspace(20, 50, 300)]
    idx = pd.date_range(H, periods=len(p))
    return cycle_features(pd.Series(p, index=idx), pd.Series(2.0, index=idx), [H])


def test_brief_on_an_alt_buy_day():
    sig, steps = public_steps(_f(), CFG, H.date())
    text = public_brief(sig, steps)
    assert "ALT BUY" in text and "1/4 of your alt budget" in text
    assert "BTC (~$" not in text and "Holdings" not in text


def test_brief_in_the_sell_window():
    day = (H + pd.Timedelta(days=CFG.rules.cycle.sell.window_start_days)).date()
    sig, steps = public_steps(_f(), CFG, day)
    text = public_brief(sig, steps)
    assert "BTC SELL" in text and "ALT SELL" in text


def test_done_steps_from_the_trade_log():
    t = pd.DataFrame(
        {
            "traded_on": pd.to_datetime(
                ["2019-12-01", "2021-06-01", "2021-06-01", "2021-07-01"]
            ).date,
            "asset": ["bitcoin", "bitcoin", "ethereum", "bitcoin"],
            "side": ["sell", "sell", "sell", "buy"],
            "qty": [9.0, 1.25, 3.0, 0.5],
            "plan_step": ["btc_sell_1", "btc_sell_1", "alt_sell_1", "rebuy_1"],
        }
    )
    d = _done_this_cycle(t, H.date())
    assert d.btc_sold == 1.25  # the 2019 trade belongs to the previous cycle
    assert d.alt_sold == {"ethereum": 3.0} and d.rebuys == 1
    assert d.steps == frozenset({"btc_sell_1", "alt_sell_1", "rebuy_1"})


def test_brief_announces_rebuys_for_usdt_holders():
    # after the top: 360+ days since the high -> the buy side starts
    f = _f()
    ath = f.index[f["days_since_ath"] == 0][-1]
    day = (ath + pd.Timedelta(days=CFG.rules.cycle.buy.start_days_since_ath)).date()
    sig, steps = public_steps(f, CFG, day)
    assert "BTC BUY (if you hold USDT from the top)" in public_brief(sig, steps)
