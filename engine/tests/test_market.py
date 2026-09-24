"""Rules 9-11: flags, regime, euphoria tiers + backstop, rebuy, breakers."""

import numpy as np
import pandas as pd
import pytest

from rotation.config import load_config
from rotation.rules.market import (
    breaker_levels,
    euphoria_tier,
    flags,
    mvrv_z,
    rebuy_signal,
    regime,
)

R = load_config().rules
N = 800


def market(**over):
    idx = pd.date_range("2020-01-06", periods=N)  # a Monday
    t = np.arange(N)
    btc = 10_000 * 1.001**t * (1 + 0.05 * np.sin(2 * np.pi * t / 21))  # gentle trend, real swings
    m = pd.DataFrame(
        {
            "btc_close": btc,
            "btc_mcap": btc * 18e6,
            "btc_realized_cap": btc * 18e6 / 1.5,
            "btc_dominance": 60.0,
            "funding_btc": 0.0001,
            "funding_eth": 0.0001,
            "altseason_index": 40.0,
            "memes_top20": 1,
            "breadth": 0.4,
        },
        index=idx,
    )
    for k, v in over.items():
        m[k] = v
    return m


def test_calm_market_has_no_flags():
    f = flags(market(), R.flags).iloc[-1]
    assert f["flag_count"] == 0


def test_each_simple_flag_fires():
    fl = R.flags
    assert flags(market(altseason_index=76.0), fl).iloc[-1]["altseason"]
    assert flags(market(memes_top20=3), fl).iloc[-1]["memes"]
    assert flags(market(retail_mania=True), fl).iloc[-1]["retail_mania"]
    dom = np.full(N, 60.0)
    dom[-1] = 51.9  # down 8.1 pts vs 60 days ago
    assert flags(market(btc_dominance=dom), fl).iloc[-1]["dominance_drop"]


def test_funding_flag_needs_14_straight_days_of_the_average():
    fund = np.full(N, 0.0001)
    fund[-14:] = 0.0006
    f = flags(market(funding_btc=fund, funding_eth=fund), R.flags)
    assert f.iloc[-1]["funding"] and not f.iloc[-2]["funding"]
    # average of BTC 0.0009 and ETH 0.0001 = 0.0005: not above the threshold
    f = flags(market(funding_btc=np.where(fund > 0.0001, 0.0009, 0.0001)), R.flags)
    assert not f.iloc[-1]["funding"]


def test_mayer_and_weekly_rsi_fire_in_a_parabolic_run():
    btc = 10_000 * np.r_[np.full(N - 120, 1.0), 1.02 ** np.arange(120)]
    f = flags(market(btc_close=btc), R.flags).iloc[-1]
    assert f["mayer"] and f["weekly_rsi"]


def test_missing_inputs_never_flag_but_are_reported():
    f = flags(market(funding_btc=np.nan, funding_eth=np.nan), R.flags).iloc[-1]
    assert not f["funding"] and "funding;" in f["flags_unknown"]


def test_mvrv_z_no_lookahead():
    m = market()
    z_full = mvrv_z(m["btc_mcap"], m["btc_realized_cap"])
    z_cut = mvrv_z(m["btc_mcap"].iloc[:500], m["btc_realized_cap"].iloc[:500])
    assert z_full.iloc[499] == pytest.approx(z_cut.iloc[-1])


# --- regime ---------------------------------------------------------------------


def test_regime_order_and_weekly_update():
    m = market()
    none = pd.Series(0, index=m.index)
    r = regime(m, none, R.regime)
    assert r.iloc[-1] == "accumulate"  # above 200D but breadth 0.4 < 0.5
    dom = 60 - 0.01 * np.arange(N)  # falling dominance
    r = regime(market(breadth=0.6, btc_dominance=dom), none, R.regime)
    assert r.iloc[-1] == "expand"
    three = pd.Series(3, index=m.index)
    assert regime(m, three, R.regime).iloc[-1] == "euphoria"  # euphoria wins over expand
    # regime only changes on Sundays
    changes = r.ne(r.shift()) & r.notna() & r.shift().notna()
    assert (r.index[changes].dayofweek == 6).all()


def test_defend_needs_btc_below_a_falling_200d():
    btc = 10_000 * np.r_[1.001 ** np.arange(500), 1.001**500 * 0.997 ** np.arange(N - 500)]
    r = regime(
        market(btc_close=btc), pd.Series(0, index=range(N)).set_axis(market().index), R.regime
    )
    assert r.iloc[-1] == "defend"


def test_breaker_forces_defend_same_day():
    m = market()
    brk = pd.Series(False, index=m.index)
    brk.iloc[-1] = True  # a Wednesday or so, not a Sunday
    r = regime(m, pd.Series(0, index=m.index), R.regime, breaker_defend=brk)
    assert r.iloc[-1] == "defend" and r.iloc[-2] != "defend"


# --- euphoria tiers, backstop, rebuy ----------------------------------------------


def test_euphoria_tiers():
    idx = pd.date_range("2021-01-04", periods=4)
    count = pd.Series([2, 3, 5, 6], index=idx)
    t = euphoria_tier(count, pd.Series(100.0, index=idx), R.euphoria_actions)
    assert list(t["tier"]) == [0, 1, 2, 3]


def test_backstop_after_flags_on_weekly_close_below_20w():
    idx = pd.date_range("2021-01-03", periods=7 * 40)  # starts on a Sunday
    btc = pd.Series(np.r_[np.linspace(100, 200, 7 * 30), np.linspace(200, 120, 70)], index=idx)
    count = pd.Series(0, index=idx)
    count.iloc[200:210] = 3  # 3 flags for a while near the top
    t = euphoria_tier(count, btc, R.euphoria_actions)
    fired = t.index[t["backstop"]]
    assert len(fired) and fired[0] > idx[210] and (fired.dayofweek == 6).all()
    assert (t.loc[fired, "tier"] == 3).all()
    # without the earlier flags, the same price path does not trigger it
    t0 = euphoria_tier(pd.Series(0, index=idx), btc, R.euphoria_actions)
    assert not t0["backstop"].any()


def test_rebuy_signal():
    idx = pd.date_range("2022-01-01", periods=3)
    btc = pd.Series([100.0, 49.0, 49.0], index=idx)
    z = pd.Series([2.0, 1.5, 0.9], index=idx)
    assert list(rebuy_signal(btc, z, R.euphoria_actions)) == [False, False, True]


def test_breaker_levels():
    v = pd.Series([100.0, 90.0, 85.0, 76.0, 74.0, 120.0, 100.0])
    assert list(breaker_levels(v, R.breakers)) == [0, 0, 1, 1, 2, 0, 1]
