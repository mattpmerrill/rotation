"""A person following their plan step by step must end the cycle exactly where the
backtests say: cycle harvest on the BTC core + the Basket Lab result for the alt budget."""

from dataclasses import replace

import pandas as pd
import pytest

from rotation.backtest.alt_harvest import AltRules, simulate
from rotation.backtest.basket_lab import SLICE_DAYS, coin_series
from rotation.backtest.cycle_sim import run_cycle
from rotation.config import load_config
from rotation.data import cache
from rotation.person import Done, Holdings, Plan, person_steps
from rotation.rules.cycle import cycle_features, rules_from_config

C = load_config().rules.cycle
needs_cache = pytest.mark.skipif(
    cache.read("universe", "prices") is None, reason="needs the local data cache"
)


@needs_cache
def test_following_the_plan_matches_the_backtests():
    fee = C.account.fee_per_trade
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    halvings = [pd.Timestamp(h) for h in C.halvings]
    f = cycle_features(btc, mvrv, halvings, C.sell.trend_weekly_sma)
    alt = px[px["coin_id"] != "bitcoin"].pivot(index="date", columns="coin_id", values="price_usd")
    h, end = halvings[2], halvings[3] - pd.Timedelta(days=1)
    basket = ("ethereum", "binancecoin", "ripple", "solana", "chainlink")
    plan = Plan(alt_budget_btc=1.0, sell_btc_frac=0.5, sell_alt_frac=1.0, basket=basket)

    # --- follow the plan day by day ---
    b, usdt, alts = 11.0, 0.0, {}
    steps_done, btc_sold, alt_sold, rebuys = set(), 0.0, {}, set()
    for t in f.loc[h:end].index:
        prices = {c: alt.at[t, c] for c in basket if t in alt.index and not pd.isna(alt.at[t, c])}
        hold = Holdings(b, usdt, dict(alts))
        done = Done(frozenset(steps_done), btc_sold, dict(alt_sold), len(rebuys))
        sig, steps = person_steps(f, C, t.date(), plan, hold, done, prices, fee)
        p = sig.price
        for s in steps:
            if s.asset == "bitcoin" and s.kind == "sell":
                b -= s.qty
                usdt += s.qty * p * (1 - fee)
                if s.step.startswith("btc_sell"):
                    btc_sold += s.qty
            elif s.asset == "bitcoin":
                b += s.usd * (1 - fee) / p
                usdt -= s.usd
                rebuys.add(s.step)
            elif s.kind == "buy":
                alts[s.asset] = alts.get(s.asset, 0.0) + s.usd * (1 - fee) / prices[s.asset]
                usdt -= s.usd
            else:
                alts[s.asset] -= s.qty
                usdt += s.qty * prices[s.asset] * (1 - fee)
                alt_sold[s.asset] = alt_sold.get(s.asset, 0.0) + s.qty
            steps_done.add(s.step)
    last = f.loc[:end].index[-1]
    live = b + usdt / btc[last] + sum(q * alt.at[last, c] / btc[last] for c, q in alts.items())

    # --- the backtests ---
    sell, buy = rules_from_config(C)
    sell = replace(sell, target_frac=0.5)
    core = (
        run_cycle(
            f.loc[:end], sell, buy, start_btc=10.0, fee=fee, tax_rate=0.0, start=str(h.date())
        )
        .daily["btc_equiv"]
        .iloc[-1]
    )
    starts = [h + pd.Timedelta(days=d) for d in SLICE_DAYS]
    idx = f.loc[h:end].index
    never = AltRules(1.0, 0.0, 0.10, "usd")
    res = {
        (c, s): simulate(f, alt, [c], s, end, never, sell, buy, fee)["btc_equiv"]
        for c in basket
        for s in starts
    }
    sleeve = sum(coin_series(res, c, starts, idx) for c in basket).iloc[-1] / len(basket)

    assert len(steps_done) >= 4 + 4 + 4 + 4  # alt slices, BTC sells, alt sells, rebuys
    assert live == pytest.approx(core + sleeve, rel=1e-6)
