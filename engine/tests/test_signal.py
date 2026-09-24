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
