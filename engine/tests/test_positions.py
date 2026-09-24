"""Rules 4-8 on worked examples from the program doc."""

from datetime import date, timedelta

import pytest

from rotation.config import load_config
from rotation.rules.positions import (
    ladder_step,
    leverage_plan,
    open_position,
    rotation_check,
    route_realized,
    time_stop_hit,
    trim_value,
)

R = load_config().rules
D0 = date(2024, 1, 1)


def fresh(qty=100.0, stop=80.0):
    return open_position("sol", D0, 100.0, qty, stop)


# --- rule 4: ladder -------------------------------------------------------------


def test_full_ladder_walkthrough():
    p = fresh()
    s = ladder_step(p, 130.0, 120.0, R.ladder)  # +30%
    assert [(a.reason, a.qty) for a in s.actions] == [("rung_1", 20.0)]
    assert s.position.qty == 80 and s.position.stop == 100.0  # break-even

    s = ladder_step(s.position, 160.0, 140.0, R.ladder)  # +60%
    assert [(a.reason, a.qty) for a in s.actions] == [("rung_2", 20.0)]
    assert s.position.stop == 125.0  # +25%

    s = ladder_step(s.position, 200.0, 170.0, R.ladder)  # +100%
    assert [(a.reason, a.qty) for a in s.actions] == [("rung_3", 25.0)]
    assert s.position.qty == 35.0 and s.position.stop == 150.0  # runner = 35%, stop +50%

    s = ladder_step(s.position, 260.0, 210.0, R.ladder)  # runner rides
    assert s.actions == [] and s.position.high == 260.0
    s = ladder_step(s.position, 200.0, 205.0, R.ladder)  # daily close below 20D SMA
    assert [(a.kind, a.reason, a.qty) for a in s.actions] == [("exit", "runner_sma", 35.0)]
    assert s.position is None


def test_runner_exits_25pct_off_high_even_above_sma():
    p = fresh()
    for close in (130.0, 160.0, 200.0, 300.0):
        p = ladder_step(p, close, 100.0, R.ladder).position
    s = ladder_step(p, 225.0, 150.0, R.ladder)  # 300 -> 225 is exactly -25%
    assert s.actions[-1].reason == "runner_high" and s.position is None


def test_gap_up_fires_several_rungs_in_one_day():
    s = ladder_step(fresh(), 210.0, 150.0, R.ladder)
    assert [a.reason for a in s.actions] == ["rung_1", "rung_2", "rung_3"]
    assert s.position.qty == pytest.approx(35.0) and s.position.stop == 150.0


def test_stop_exits_everything():
    s = ladder_step(fresh(stop=80.0), 79.0, 95.0, R.ladder)
    assert [(a.kind, a.reason, a.qty) for a in s.actions] == [("exit", "stop", 100.0)]


def test_break_even_stop_after_first_rung():
    p = ladder_step(fresh(), 131.0, 120.0, R.ladder).position
    s = ladder_step(p, 100.0, 110.0, R.ladder)
    assert s.actions[0].reason == "stop" and s.actions[0].qty == 80.0


def test_runner_trail_does_not_apply_before_last_rung():
    p = ladder_step(fresh(), 130.0, 120.0, R.ladder).position
    s = ladder_step(p, 115.0, 125.0, R.ladder)  # below SMA, but only 1 rung hit
    assert s.actions == [] and s.position.qty == 80


# --- rule 6: time stop ------------------------------------------------------------


def test_time_stop():
    p, ts = fresh(), R.time_stop
    day45 = D0 + timedelta(days=45)
    assert time_stop_hit(p, day45, 109.0, 2, ts)
    assert not time_stop_hit(p, day45 - timedelta(days=1), 109.0, 2, ts)  # too early
    assert not time_stop_hit(p, day45, 110.0, 2, ts)  # up 10%
    assert not time_stop_hit(p, day45, 105.0, 3, ts)  # score 3 keeps it


# --- rule 3: trim -----------------------------------------------------------------


def test_trim_at_15_back_to_10():
    pos = R.positions
    assert trim_value(14_900, 100_000, pos) == 0.0
    assert trim_value(15_000, 100_000, pos) == pytest.approx(5_000)


# --- rule 5: routing --------------------------------------------------------------


def test_routing_tax_first_then_50_25_25():
    r = route_realized(1_000.0, held_days=60, cfg=R.routing)
    assert r.tax_reserve == pytest.approx(300)
    assert (r.vault_btc, r.dry_powder, r.recycle) == pytest.approx((350, 175, 175))


def test_routing_long_term_rate_and_losses():
    assert route_realized(1_000.0, 400, R.routing).tax_reserve == pytest.approx(150)
    loss = route_realized(-500.0, 30, R.routing)
    assert loss.tax_reserve == pytest.approx(-150) and loss.vault_btc == 0


# --- rule 7: rotation -------------------------------------------------------------


def test_rotation_formula():
    # A: 20% upside, score 3 -> 12. B: 80% upside, score 4 -> 64. Edge 52 pp.
    # Hurdle: fees 0.6 + tax on a 50% gain: 0.30 * 0.5/1.5 = 10 pp + 10 = 20.6
    c = rotation_check(
        0.20, 3, 0.80, 4, gain_a=0.5, a_in_trend=False, cfg=R.rotation, tax_rate=0.30
    )
    assert c.edge_pp == pytest.approx(52.0) and c.hurdle_pp == pytest.approx(20.6)
    assert c.rotate


def test_rotation_blocked_when_edge_small_or_a_protected():
    c = rotation_check(0.5, 3, 0.6, 3, 0.0, False, R.rotation, 0.30)  # edge 6 < 10.6
    assert not c.rotate
    c = rotation_check(0.1, 4, 2.0, 5, 0.0, True, R.rotation, 0.30)  # A: 4+ and trending
    assert not c.rotate and c.reason.startswith("protected")


# --- rule 8: leverage -------------------------------------------------------------


def _lev(**kw):
    cfg = R.leverage.model_copy(update={"enabled": True})
    args = {
        "symbol": "BTC",
        "score": 5,
        "entry": 100.0,
        "stop": 95.0,
        "portfolio_value": 100_000.0,
        "margin_available": 10_000.0,
        "open_count": 0,
        "cfg": cfg,
    }
    args.update(kw)
    return leverage_plan(**args)


def test_leverage_off_by_default():
    assert not leverage_plan("BTC", 5, 100, 95, 1e5, 1e4, 0, R.leverage).ok


def test_leverage_sizing_risk_and_liquidation():
    p = _lev()  # 5% stop: notional = 1% * 100k / 5% = 20k
    assert p.ok and p.notional == pytest.approx(20_000)
    assert p.leverage == pytest.approx(3.0)  # liq allows up to 1/(2*0.05+0.005) = 9.5x
    stop_dist, liq_dist = 0.05, 1 - p.liquidation_price / 100
    assert liq_dist >= 2 * stop_dist
    assert p.notional * stop_dist == pytest.approx(1_000)  # loses exactly 1% at the stop


def test_leverage_wide_stop_lowers_multiple():
    p = _lev(stop=80.0)  # 20% stop -> max lev 1/(0.4+0.005) = 2.47x
    assert p.ok and p.leverage == pytest.approx(1 / 0.405)
    assert 1 - p.liquidation_price / 100 >= 2 * 0.20 - 1e-9


def test_leverage_gates():
    assert not _lev(symbol="DOGE").ok
    assert not _lev(score=4).ok
    assert not _lev(open_count=2).ok
    assert _lev(stop=60.0).leverage == pytest.approx(1 / 0.805)  # 40% stop: ~1.24x still ok
    assert not _lev(stop=50.0).ok  # 50% stop: no leverage keeps liq 2x away
    capped = _lev(margin_available=1_000.0)
    assert capped.margin == 1_000 and capped.notional == pytest.approx(3_000)
