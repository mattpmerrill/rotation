"""Simulator bookkeeping on tiny synthetic markets where every number is checkable."""

import numpy as np
import pandas as pd
import pytest

from rotation.backtest.sim import Options, run
from rotation.config import load_config

# The original tests exercise the program doc's USD-bucket books; sleeve tests are below.
_BASE = load_config().rules
R = _BASE.model_copy(
    update={"portfolio": _BASE.portfolio.model_copy(update={"mode": "usd_buckets"})}
)
COST = R.backtest.fee_per_side + R.backtest.slippage_per_side
START = "2021-01-04"  # a Monday


def mkt(n, btc=30_000.0, regime="expand", tier=None, flags=None):
    idx = pd.date_range(START, periods=n)
    return pd.DataFrame(
        {
            "btc_close": btc,
            "flag_count": 0 if flags is None else flags,
            "regime": regime,
            "tier": 0 if tier is None else tier,
            "backstop": False,
            "rebuy": False,
        },
        index=idx,
    )


def feats(prices, coin="alt", rank=10, score=5, stop_frac=0.8, size=1.0):
    idx = pd.date_range(START, periods=len(prices))
    p = np.asarray(prices, float)
    return pd.DataFrame(
        {
            "date": idx,
            "coin_id": coin,
            "close": p,
            "rank": rank,
            "sma20": p * 0.9,  # price stays above its SMA unless a test says otherwise
            "gates_pass": True,
            "gates_pass_ex_altbtc": True,
            "altbtc": True,
            "unknown_gates": "",
            "trend": True,
            "beating_btc": True,
            "location": True,
            "not_crowded": True,
            "flow": True,
            "score": score,
            "stop": p * stop_frac,
            "target": p * 2,
            "reward_risk": 5.0 if size > 0 else 0.0,  # the sim sizes from score + R:R
            "size": size,
        }
    )


def _run(f, m, rules=None, **opts):
    end = m.index[-1].strftime("%Y-%m-%d")
    return run(rules or R, f, m, START, end, Options(**opts))


def test_starts_with_vault_at_target_and_dry_powder_in_cash():
    m = mkt(3)
    res = _run(feats([100.0] * 3, size=0.0), m)  # nothing to buy
    e = res.equity.iloc[0]
    target = R.buckets.expand.vault_btc * R.backtest.initial_usd
    assert e["vault_btc"] * 30_000 == pytest.approx(target * (1 - COST))
    assert e["positions"] == 0


def test_entry_size_is_max_weight_and_round_trip_costs_fees():
    m = mkt(3)
    prices = [100.0, 100.0, 70.0]  # day 3 hits the 80 stop
    res = _run(feats(prices), m)
    buy = res.trades[(res.trades.side == "buy") & (res.trades.coin_id == "alt")].iloc[0]
    v0 = R.backtest.initial_usd * (1 - R.buckets.expand.vault_btc * COST)
    assert buy["usd"] == pytest.approx(R.positions.max_alt_weight * v0, rel=1e-3)
    sell = res.trades[res.trades.side == "sell"].iloc[0]
    assert sell["reason"] == "stop"
    assert sell["usd"] == pytest.approx(buy["qty"] * 70.0 * (1 - COST))


def test_ladder_profit_is_routed_to_vault_and_tax_reserve():
    m = mkt(3)
    res = _run(feats([100.0, 100.0, 130.0]), m)  # +30% on day 3 -> rung 1
    sell = res.trades[res.trades.reason == "rung_1"].iloc[0]
    gain = sell["gain"]
    assert gain > 0
    routed = res.trades[res.trades.reason == "profit_routing"].iloc[0]
    tax = R.routing.tax_reserve_rate * gain
    assert routed["usd"] == pytest.approx((gain - tax) * R.routing.vault_btc)
    assert res.equity.iloc[-1]["reserve"] == pytest.approx(tax)


def test_hold_option_skips_the_ladder():
    m = mkt(3)
    res = _run(feats([100.0, 100.0, 130.0]), m, take_profits=False)
    assert not (res.trades.reason == "rung_1").any()
    assert res.equity.iloc[-1]["positions"] == 1


def test_euphoria_tier_sells_a_quarter_and_pauses_entries():
    m = mkt(4, tier=[0, 0, 1, 1], flags=[0, 0, 3, 3])
    res = _run(feats([100.0] * 4), m)
    sold = res.trades[res.trades.reason == "euphoria_1"]
    held_qty = res.trades[res.trades.side == "buy"].iloc[-1]["qty"]
    assert sold["qty"].iloc[0] == pytest.approx(0.25 * held_qty)
    # no new buys after the sale
    later_buys = res.trades[(res.trades.side == "buy") & (res.trades.date > m.index[2])]
    assert later_buys[later_buys.coin_id != "bitcoin"].empty


def test_dead_coin_exits_at_haircut():
    m = mkt(12)
    f = feats([100.0] * 12)
    f = f[f.date <= f.date.iloc[2]]  # data stops after day 3
    res = _run(f, m)
    exit_ = res.trades[res.trades.reason == "delisted"].iloc[0]
    assert exit_["px"] == pytest.approx(100.0 * (1 - R.backtest.delisted_haircut))


def test_value_in_btc_is_consistent():
    m = mkt(5, btc=[30_000, 31_000, 29_000, 30_500, 30_000])
    res = _run(feats([100.0] * 5, size=0.0), m)
    e = res.equity
    assert np.allclose(e["value_btc"] * e["btc_close"], e["value_usd"])


def test_breaker_forces_defend_for_a_week_then_rearms():
    n = 40
    # portfolio is 35% BTC: an 80% BTC drop is a ~28% portfolio drawdown
    btc = np.r_[np.full(5, 30_000.0), np.full(n - 5, 6_000.0)]
    m = mkt(n, btc=btc)
    res = _run(feats([100.0] * n, size=0.0), m)
    e = res.equity
    fired = res.trades[res.trades.reason == "breaker_2_defend"]
    assert len(fired) == 1  # re-based: flat afterwards, so it does not fire again
    t0 = fired.date.iloc[0]
    assert (e.loc[t0 : t0 + pd.Timedelta(days=6), "regime"] == "defend").all()
    assert e.loc[t0 + pd.Timedelta(days=8) :, "regime"].eq("expand").all()


def test_two_way_vault_trims_back_to_target_and_reserves_tax():
    n = 14  # BTC doubles on day 2; the Sunday rebalance (day 7) trims the Vault
    btc = np.r_[30_000.0, np.full(n - 1, 60_000.0)]
    m = mkt(n, btc=btc)
    res = _run(feats([100.0] * n, size=0.0), m)
    trim = res.trades[res.trades.reason == "vault_trim"]
    assert len(trim) == 1 and trim.gain.iloc[0] > 0
    e = res.equity.loc[trim.date.iloc[0]]
    vault_w = e.vault_btc * e.btc_close / e.value_usd
    assert vault_w == pytest.approx(R.buckets.expand.vault_btc, abs=0.01)
    assert e.reserve == pytest.approx(R.routing.long_term_rate * trim.gain.iloc[0])


def test_top_up_only_vault_is_never_trimmed():
    r = R.model_copy(update={"rebalance": R.rebalance.model_copy(update={"vault": "top_up_only"})})
    n = 14
    m = mkt(n, btc=np.r_[30_000.0, np.full(n - 1, 60_000.0)])
    res = _run(feats([100.0] * n, size=0.0), m, rules=r)
    assert not (res.trades.reason == "vault_trim").any()


def test_no_rebuy_within_cooldown_after_a_stop():
    n = 12
    prices = [100.0, 100.0, 70.0] + [70.0] * (n - 3)  # stopped on day 3, still eligible after
    res = _run(feats(prices), mkt(n))
    buys = res.trades[(res.trades.side == "buy") & (res.trades.coin_id == "alt")]
    stop_day = res.trades[res.trades.reason == "stop"].date.iloc[0]
    rebuys = buys[buys.date >= stop_day]
    assert (rebuys.date - stop_day).dt.days.min() >= R.positions.reentry_cooldown_days


def test_score_threshold_variant_changes_entries_without_rebuilding_features():
    from rotation.backtest.experiments import with_rules

    m = mkt(3)
    f = feats([100.0] * 3, score=3)
    base = _run(f, m)
    strict = _run(f, m, rules=with_rules(R, score={"half_size_at": 4}))
    assert (base.trades.coin_id == "alt").any()
    assert not (strict.trades.coin_id == "alt").any()


# --- btc_sleeve mode (Matt, 2026-09-24): 90% core, 10% alt sleeve ------------------------

S = _BASE  # config default is btc_sleeve


def test_sleeve_starts_90_10_with_no_fee_and_counts_in_btc():
    res = _run(feats([100.0] * 3, size=0.0), mkt(3), rules=S)
    e = res.equity.iloc[0]
    assert S.portfolio.mode == "btc_sleeve"
    assert e.vault_btc == pytest.approx(9.9) and e.sleeve_btc == pytest.approx(1.1)
    assert e.net_btc == pytest.approx(11.0)


def test_sleeve_entry_is_sized_on_the_sleeve_and_paid_in_btc():
    res = _run(feats([100.0] * 3), mkt(3), rules=S)
    buy = res.trades[(res.trades.side == "buy") & (res.trades.coin_id == "alt")].iloc[0]
    sleeve_usd = 1.1 * 30_000
    assert buy.usd == pytest.approx(S.positions.max_alt_weight * sleeve_usd, rel=1e-6)
    e = res.equity.iloc[0]
    assert e.vault_btc == pytest.approx(9.9)  # the core paid nothing
    assert e.sleeve_btc < 1.1


def test_sleeve_profit_grows_the_core_and_loss_never_touches_it():
    win = _run(feats([100.0, 100.0, 130.0]), mkt(3), rules=S)  # rung 1 on day 3
    assert win.equity.iloc[-1].vault_btc > 9.9
    loss = _run(feats([100.0, 100.0, 70.0]), mkt(3), rules=S)  # stopped out
    assert loss.equity.iloc[-1].vault_btc == pytest.approx(9.9)
    assert loss.equity.iloc[-1].net_btc < 11.0


def test_sleeve_core_is_never_trimmed_when_btc_rallies():
    n = 14
    m = mkt(n, btc=np.r_[30_000.0, np.full(n - 1, 60_000.0)])
    res = _run(feats([100.0] * n, size=0.0), m, rules=S)
    assert res.trades.empty  # nothing is sold or bought: the core just holds
    assert res.equity.iloc[-1].net_btc == pytest.approx(11.0)


def test_sleeve_weights_renormalise_without_vault_and_leverage():
    from rotation.backtest.sim import Sim

    sim = Sim(S, feats([100.0], size=0.0), mkt(1), Options())
    w = sim.weights("expand")  # 20/15/10 alts + 10 dry of 55
    assert w["large"] == pytest.approx(20 / 55) and w["dry_powder"] == pytest.approx(10 / 55)
    assert sum(w.values()) == pytest.approx(1.0)


def test_sleeve_books_conserve_btc_with_zero_costs():
    """No fees, no tax, flat BTC: total BTC moves by exactly the alt P&L."""
    from rotation.backtest.experiments import with_rules

    free = with_rules(
        S,
        backtest={"fee_per_side": 0.0, "slippage_per_side": 0.0},
        routing={"tax_reserve_rate": 0.0, "long_term_rate": 0.0},
    )
    res = _run(feats([100.0, 100.0, 130.0, 130.0]), mkt(4), rules=free)
    buy = res.trades[(res.trades.side == "buy") & (res.trades.coin_id == "alt")].iloc[0]
    pnl_btc = buy.qty * (130.0 - 100.0) / 30_000
    assert res.equity.iloc[-1].net_btc == pytest.approx(11.0 + pnl_btc, rel=1e-9)


def test_no_sleeve_means_no_alt_buys():
    from rotation.backtest.experiments import with_rules

    res = _run(feats([100.0] * 3), mkt(3), rules=with_rules(S, portfolio={"sleeve_frac": 0.0}))
    assert res.trades.empty or not (res.trades.coin_id == "alt").any()
