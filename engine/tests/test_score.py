"""Rule 1 (gates) and rule 2 (score, sizing) on hand-built price paths."""

import numpy as np
import pandas as pd
import pytest

from rotation.config import load_config
from rotation.rules.score import entry_plan, gates, initial_stop, score, target

CFG = load_config().rules
N = 420  # > 365 days of history, > 200D SMA


def coin(close, btc=None, volume=5e7, rank=30, **extra):
    idx = pd.date_range("2023-01-01", periods=len(close))
    df = pd.DataFrame(
        {
            "close": np.asarray(close, float),
            "btc_close": np.full(len(close), 30_000.0) if btc is None else np.asarray(btc, float),
            "volume_usd": volume if np.ndim(volume) else np.full(len(close), float(volume)),
            "rank": rank,
        },
        index=idx,
    )
    for k, v in extra.items():
        df[k] = v
    return df


def uptrend(n=N, rate=0.003):
    return 10 * (1 + rate) ** np.arange(n)


# --- gates ----------------------------------------------------------------------


def test_gates_pass_for_liquid_ranked_outperformer():
    g = gates(coin(uptrend()), CFG.universe).iloc[-1]
    assert g["passes"]
    assert g["unknown_gates"] == "exchanges;unlock;catalyst;"  # backtest: live-only unknown


def test_gate_failures():
    u = CFG.universe
    assert not gates(coin(uptrend(), rank=101), u).iloc[-1]["passes"]  # outside top 100
    assert not gates(coin(uptrend(), volume=19e6), u).iloc[-1]["passes"]  # < $20M volume
    assert not gates(coin(uptrend(300)), u).iloc[-1]["passes"]  # < 12 months history
    df = coin(uptrend(), unlock_frac_90d=0.05)
    assert not gates(df, u).iloc[-1]["passes"]  # 5% unlocking in 90 days
    df = coin(uptrend(), exchanges=1)
    assert not gates(df, u).iloc[-1]["passes"]


def test_altbtc_gate_fails_when_bleeding_against_btc():
    down = 10 * 0.998 ** np.arange(N)  # smooth decline: below 50D and no higher lows
    assert not gates(coin(down), CFG.universe).iloc[-1]["altbtc"]


# --- score ----------------------------------------------------------------------


def test_trend_and_beating_btc_points():
    s = score(coin(uptrend()), CFG.score).iloc[-1]
    assert s["trend"] and s["beating_btc"]


def test_location_point_needs_near_sma_and_near_support():
    s = score(coin(uptrend(rate=0.003)), CFG.score).iloc[-1]
    # 0.3%/day for 30 days is ~9.4% above the 30D low: still "near support" (<= 10%)
    assert s["location"]
    s = score(coin(uptrend(rate=0.006)), CFG.score).iloc[-1]
    # 0.6%/day: ~19% above the 30D low -> not near support
    assert not s["location"]


def test_not_crowded_uses_funding_and_oi():
    base = coin(uptrend())
    ok = score(base.assign(funding_8h=0.0001, oi_usd=1e8), CFG.score).iloc[-1]
    assert ok["not_crowded"]
    hot = score(base.assign(funding_8h=0.0003, oi_usd=1e8), CFG.score).iloc[-1]
    assert not hot["not_crowded"]  # funding 0.03%/8h > 0.01%
    oi = np.full(N, 1e8)
    oi[-1] = 1.31e8  # +31% in 7 days
    assert not score(base.assign(funding_8h=0.0, oi_usd=oi), CFG.score).iloc[-1]["not_crowded"]


def test_not_crowded_missing_data_policy():
    base = coin(uptrend())
    assert score(base, CFG.score).iloc[-1]["not_crowded"]  # no perp market -> pass (default)
    no_oi = score(base.assign(funding_8h=0.0003), CFG.score).iloc[-1]
    assert not no_oi["not_crowded"]  # funding exists, OI missing: judged on funding


def test_flow_point():
    vol = np.full(N, 5e7)
    vol[-7:] = 8e7  # last week's volume above the 30D average
    assert score(coin(uptrend(), volume=vol), CFG.score).iloc[-1]["flow"]
    assert not score(coin(uptrend()), CFG.score).iloc[-1]["flow"]  # flat volume
    flagged = coin(uptrend(), flow_flag=True)
    assert score(flagged, CFG.score).iloc[-1]["flow"]


def test_score_is_sum_of_points():
    s = score(coin(uptrend()), CFG.score)
    assert (
        s["score"] == s[["trend", "beating_btc", "location", "not_crowded", "flow"]].sum(axis=1)
    ).all()


# --- entry plan -----------------------------------------------------------------


def test_initial_stop_and_cap():
    e = CFG.entry
    df = coin([100.0] * 29 + [80.0, 100.0])
    assert initial_stop(df, e).iloc[-1] == pytest.approx(80 * 0.98)  # 2% under the 30D low
    df = coin([100.0] * 29 + [50.0, 100.0])
    assert initial_stop(df, e).iloc[-1] == pytest.approx(75.0)  # capped at 25% below


def test_target_prior_high_or_fallback():
    e = CFG.entry
    assert target(coin([200.0, 100.0]), e).iloc[-1] == 200.0
    assert target(coin([50.0, 100.0]), e).iloc[-1] == 200.0  # at the high: +100%


def test_sizing_full_half_pass_and_reward_risk():
    r, e = CFG.score, CFG.entry
    df = coin([100.0] * 29 + [95.0, 100.0])  # stop 93.1, target +100% -> R:R ~14.5
    for pts, size in [(5, 1.0), (4, 1.0), (3, 0.5), (2, 0.0)]:
        sc = pd.DataFrame({"score": pts}, index=df.index)
        assert entry_plan(df, sc, r, e).iloc[-1]["size"] == size
    df = coin([100.0] * 29 + [80.0, 104.0, 100.0])  # target 104 (+4%) vs 21.6% risk
    sc = pd.DataFrame({"score": 5}, index=df.index)
    plan = entry_plan(df, sc, r, e).iloc[-1]
    assert plan["reward_risk"] < 3 and plan["size"] == 0.0
