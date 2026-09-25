"""The Basket Lab's shortcut (a basket = the mean of its coins) must match the full
simulator run on the whole basket. Checked on real data for real baskets."""

import pandas as pd
import pytest

from rotation.backtest.alt_harvest import simulate
from rotation.backtest.basket_lab import NEVER, SLICE_DAYS, coin_series
from rotation.config import load_config
from rotation.data import cache
from rotation.rules.cycle import cycle_features, rules_from_config

needs_cache = pytest.mark.skipif(
    cache.read("universe", "prices") is None, reason="needs the local data cache"
)


@needs_cache
@pytest.mark.parametrize(
    ("halving", "end", "basket"),
    [
        ("2020-05-11", "2024-04-18", ["ethereum", "binancecoin", "ripple", "solana", "chainlink"]),
        ("2016-07-09", "2020-05-10", ["ethereum", "ripple", "litecoin", "dash", "monero"]),
    ],
)
def test_basket_equals_mean_of_its_coins(halving, end, basket):
    from dataclasses import replace

    c = load_config().rules.cycle
    sell, buy = rules_from_config(c)
    sell = replace(sell, target_frac=0.5)
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    cf = cycle_features(btc, mvrv, [pd.Timestamp(h) for h in c.halvings], c.sell.trend_weekly_sma)
    alt = px[px["coin_id"] != "bitcoin"].pivot(index="date", columns="coin_id", values="price_usd")
    h, e = pd.Timestamp(halving), pd.Timestamp(end)
    starts = [h + pd.Timedelta(days=d) for d in SLICE_DAYS]
    idx = cf.loc[h:e].index
    fee = c.account.fee_per_trade

    # the full simulator on the whole basket, one run per slice
    full = []
    for s in starts:
        coins = [x for x in basket if not pd.isna(alt.at[s, x])]
        d = simulate(cf, alt, coins, s, e, NEVER, sell, buy, fee)["btc_equiv"]
        # coins without a price on this date keep their share of the slice in BTC
        share = len(coins) / len(basket)
        full.append(d.reindex(idx).fillna(1.0) * share + (1 - share))
    direct = sum(full) / len(full)

    # the shortcut: per-coin series, averaged
    results = {}
    for x in basket:
        for s in starts:
            if not pd.isna(alt.at[s, x]):
                results[(x, s)] = simulate(cf, alt, [x], s, e, NEVER, sell, buy, fee)["btc_equiv"]
    shortcut = sum(coin_series(results, x, starts, idx) for x in basket) / len(basket)

    pd.testing.assert_series_equal(direct, shortcut, check_names=False, rtol=1e-9)
