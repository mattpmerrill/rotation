import numpy as np
import pandas as pd
import pytest

from rotation.backtest.alt_harvest import AltRules, simulate
from rotation.config import load_config
from rotation.rules.cycle import cycle_features, rules_from_config

C = load_config().rules.cycle
SELL, BUY = rules_from_config(C)
H = pd.Timestamp("2020-01-01")


def setup(btc, alts: dict):
    idx = pd.date_range(H, periods=len(btc))
    cf = cycle_features(pd.Series(btc, index=idx, dtype=float), pd.Series(2.0, index=idx), [H])
    return cf, pd.DataFrame(alts, index=idx, dtype=float)


def test_trigger_sells_into_usdt_then_pullback_buys_btc():
    n = 120
    btc = np.r_[np.full(50, 100.0), np.full(n - 50, 85.0)]  # BTC -15% on day 50
    alt = np.r_[np.full(10, 1.0), np.full(n - 10, 1.3)]  # alt +30% on day 10
    cf, px = setup(btc, {"a": alt})
    d = simulate(
        cf,
        px,
        ["a"],
        cf.index[0],
        cf.index[-1],
        AltRules(0.25, 0.25, 0.10, "usd"),
        SELL,
        BUY,
        fee=0.0,
    )
    # 1 BTC at $100 buys 100 units; a quarter is sold at $1.30
    assert d["usdt"].iloc[20] == pytest.approx(25 * 1.3)
    assert d["btc"].iloc[60] == pytest.approx(25 * 1.3 / 85.0)  # bought on the pullback


def test_dead_coin_does_not_zero_the_basket():
    n = 30
    cf, px = setup(
        np.full(n, 100.0),
        {"a": np.full(n, 1.0), "dead": np.r_[np.full(10, 1.0), np.full(n - 10, np.nan)]},
    )
    d = simulate(
        cf,
        px,
        ["a", "dead"],
        cf.index[0],
        cf.index[-1],
        AltRules(1.0, 0.0, 0.10, "usd"),
        SELL,
        BUY,
        fee=0.0,
    )
    assert d["btc_equiv"].iloc[-1] == pytest.approx(0.5)  # half died, half is intact
