"""The live signal must do exactly what the backtest did: replay it day by day through
real history, apply its actions, and compare with run_cycle's trades."""

import pandas as pd
import pytest

from rotation.backtest.cycle_sim import run_cycle
from rotation.config import load_config
from rotation.data import cache
from rotation.rules.cycle import cycle_features, rules_from_config
from rotation.signal import compute, render

C = load_config().rules.cycle


def _features():
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    return cycle_features(btc, mvrv, [pd.Timestamp(h) for h in C.halvings], C.sell.trend_weekly_sma)


@pytest.mark.skipif(cache.read("universe", "prices") is None, reason="needs the local data cache")
def test_live_signal_replays_the_backtest_exactly():
    f = _features()
    start = "2020-05-11"  # one full cycle: the 2020 halving to the 2024 halving
    end = pd.Timestamp("2024-04-18")
    sell, buy = rules_from_config(C)
    bt = run_cycle(f.loc[:end], sell, buy, start_btc=10.0, fee=0.0, tax_rate=0.0, start=start)

    btc, usdt, sold, tranches, cycle = 10.0, 0.0, 0.0, 0, None
    live = []
    for t, row in f.loc[start:end].iterrows():
        if row["last_halving"] != cycle:
            cycle, sold = row["last_halving"], 0.0
        if usdt <= 1:
            tranches = 0
        sig = compute(f, C, t.date(), btc, usdt, sold, tranches)
        for a in sig.actions:
            if a.kind == "sell":
                btc -= a.btc
                usdt += a.btc * row["btc"]
                sold += a.btc
            else:
                btc += a.usd / row["btc"]
                usdt -= a.usd
                tranches += 1
            live.append((t, a.kind, round(a.btc, 6)))

    expected = [(r.date, r.side, round(r.btc, 6)) for r in bt.trades.itertuples()]
    assert len(expected) >= 8  # a real cycle: 4 sells + 4 buys, not two empty lists
    assert live == expected
    assert btc == pytest.approx(bt.daily.iloc[-1].btc)


@pytest.mark.skipif(cache.read("universe", "prices") is None, reason="needs the local data cache")
def test_render_mentions_phase_and_action():
    f = _features()
    sig = compute(f, C, pd.Timestamp("2021-11-01").date(), btc=10.0, usdt=0.0)
    text = render(sig, 10.0, 0.0)
    assert "SELL WINDOW" in text and "SELL" in text


# --- privacy (Matt, 2026-09-24): the public alert never reveals holdings or amounts ------


def _synthetic():
    import numpy as np

    from rotation.rules.cycle import cycle_features

    h = pd.Timestamp("2020-01-01")
    p = np.r_[np.linspace(10, 100, 560), np.linspace(100, 20, 400), np.linspace(20, 50, 300)]
    idx = pd.date_range(h, periods=len(p))
    return cycle_features(pd.Series(p, index=idx), pd.Series(2.0, index=idx), [h]), h


def _assert_private_bits_absent(text, btc, usdt):
    assert "Holdings" not in text
    assert f"{btc:.4f}" not in text
    if usdt:
        assert f"{usdt:,.0f}" not in text
    assert " BTC (~$" not in text


def test_public_sell_alert_shows_a_share_not_an_amount():
    f, h = _synthetic()
    day = (h + pd.Timedelta(days=C.sell.window_start_days)).date()
    sig = compute(f, C, day, btc=11.0, usdt=0.0)
    public = render(sig, 11.0, 0.0)
    _assert_private_bits_absent(public, 11.0, 0.0)
    assert "SELL 1/12 of the BTC you held when the window opened" in public
    private = render(sig, 11.0, 0.0, private=True)
    assert "Holdings: 11.0000 BTC" in private and "SELL 0.9166 BTC" in private


def test_public_buy_alert_shows_a_share_not_an_amount():
    f, _h = _synthetic()
    ath = f.index[f["days_since_ath"] == 0][-1]  # the LAST day at the high
    day = (ath + pd.Timedelta(days=C.buy.start_days_since_ath)).date()
    sig = compute(f, C, day, btc=7.3, usdt=123_456.0, sold_this_cycle=3.6)
    public = render(sig, 7.3, 123_456.0)
    _assert_private_bits_absent(public, 7.3, 123_456.0)
    assert "BUY 1/4 of your remaining USDT reserve" in public
    assert "123,456" in render(sig, 7.3, 123_456.0, private=True)
