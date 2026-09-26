"""The daily market job: market state from the cycle features, and live ranks."""

import numpy as np
import pandas as pd

from rotation.config import load_config
from rotation.daily import market_state, rank_markets
from rotation.rules.cycle import cycle_features

CFG = load_config()
H = pd.Timestamp("2020-01-01")


def _f(mvrv: float = 2.0):
    # up to a top on day 560, down 80% to day 959, then a recovery
    p = np.r_[np.linspace(10, 100, 560), np.linspace(100, 20, 400), np.linspace(20, 50, 300)]
    idx = pd.date_range(H, periods=len(p))
    return cycle_features(pd.Series(p, index=idx), pd.Series(mvrv, index=idx), [H])


def test_market_state_in_the_bull():
    s = market_state(_f(), CFG, (H + pd.Timedelta(days=560)).date())
    assert s.btc_price == 100 and s.drawdown == 0 and s.days_since_ath == 0
    assert s.ath_date == s.day and s.days_since_halving == 560
    assert not s.rebuy_window_open


def test_rebuy_window_opens_days_after_the_high():
    f = _f()
    top = f.index[f["days_since_ath"] == 0][-1]
    wait = CFG.rules.cycle.buy.start_days_since_ath
    before = market_state(f, CFG, (top + pd.Timedelta(days=wait - 1)).date())
    after = market_state(f, CFG, (top + pd.Timedelta(days=wait)).date())
    assert before.drawdown < CFG.rules.cycle.buy.start_drawdown  # only the clock rule applies
    assert not before.rebuy_window_open and after.rebuy_window_open
    assert after.ath_date == top.date() and after.days_since_ath == wait


def test_rebuy_window_opens_on_mvrv():
    s = market_state(_f(mvrv=0.9), CFG, (H + pd.Timedelta(days=100)).date())
    assert s.rebuy_window_open and s.mvrv == 0.9


def test_rank_markets_skips_btc_and_excluded_coins():
    m = pd.DataFrame(
        {
            "id": ["bitcoin", "ethereum", "tether", "ripple", "newcoin", "nocap"],
            "market_cap": [2e12, 4e11, 1.5e11, 1e11, 5e10, None],
            "current_price": [84000, 3000, 1, 2, 5, 1],
            "total_volume": [1, 1, 1, 1, 1, 1],
        }
    )
    r = rank_markets(m, excluded={"tether"}).set_index("id")["rank"]
    assert r["ethereum"] == 1 and r["ripple"] == 2 and r["newcoin"] == 3
    assert pd.isna(r["bitcoin"]) and pd.isna(r["tether"]) and pd.isna(r["nocap"])
