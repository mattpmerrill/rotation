"""Cycle harvest: sell into the top, rebuy near the bottom, measured in BTC."""

import numpy as np
import pandas as pd
import pytest

from rotation.backtest.cycle_sim import run_cycle
from rotation.config import load_config
from rotation.rules.cycle import SellRules, clock_tranche_days, cycle_features, rules_from_config

SELL, BUY = rules_from_config(load_config().rules.cycle)

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


def test_sells_about_the_target_then_rebuys_more_btc_lower():
    res = run_cycle(feats(cycle()), SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    tr = res.trades
    sold = tr[tr.side == "sell"].btc.sum()
    assert sold == pytest.approx(10.0 * SELL.target_frac, rel=1e-9)  # a third of the stack
    assert (tr[tr.side == "buy"].px < tr[tr.side == "sell"].px.min()).all()
    assert res.daily.iloc[-1].usd == pytest.approx(0.0, abs=1.0)  # all redeployed
    assert res.daily.iloc[-1].btc > 10.0


def test_tax_reduces_what_can_be_rebought():
    f = feats(cycle())
    free = run_cycle(f, SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    taxed = run_cycle(f, SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.20)
    assert taxed.daily.iloc[-1].btc < free.daily.iloc[-1].btc
    assert taxed.trades.tax.sum() > 0


def test_new_all_time_high_redeploys_waiting_usdt():
    # sell in the window, then price rips to a new high before any bottom signal
    up = np.linspace(10, 100, 600)
    dip = np.linspace(100, 80, 60)
    rip = np.linspace(80, 150, 120)
    p = pd.Series(np.r_[up, dip, rip], index=pd.date_range(HALVING, periods=780))
    res = run_cycle(feats(p), SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    assert (res.trades.reason == "new_ath_redeploy").any()
    assert res.daily.iloc[-1].usd == pytest.approx(0.0, abs=1.0)


def test_per_cycle_table_scores_btc_equivalent():
    res = run_cycle(feats(cycle()), SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    pc = res.per_cycle
    assert pc.iloc[0].btc_start == pytest.approx(10.0)
    assert pc.iloc[0].multiple == pytest.approx(res.daily.iloc[-1].btc_equiv / 10.0)


def test_trend_break_before_last_clock_tranche_never_oversells():
    # regression: trend break sold "the rest of the target", then clock_4 sold again
    res = run_cycle(feats(cycle()), SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    sells = res.trades[res.trades.side == "sell"]
    assert sells.btc.sum() <= 10.0 * SELL.target_frac + 1e-9


def test_a_top_after_the_window_costs_btc_but_not_the_stack():
    """The known risk: the top comes after the sell window closes. The new-high rule buys
    back higher: a slice of BTC is lost, the stack is not."""
    late = cycle(n_up=700)  # top on day 700, window ends day 580
    res = run_cycle(feats(late), SELL, BUY, start_btc=10.0, fee=0.0, tax_rate=0.0)
    assert (res.trades.reason == "new_ath_redeploy").any()
    end = res.daily.iloc[-1].btc_equiv
    assert 9.0 < end < 10.0  # lost some BTC, bounded
