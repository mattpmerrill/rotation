"""Basket Lab data: every coin's path under the alt plan, so any 5-coin basket can be
scored in the browser instantly.

The plan per cycle, from 1 BTC: buy in 4 equal slices (halving, +60, +120, +180 days),
hold without selling, sell everything in the halving-clock window, rebuy BTC in the bear.

Why a basket is just the average of its coins: under this plan nothing moves between
coins until the window, and every later step (the window sale, the bear rebuy) is
proportional to what each coin is worth. So each coin's slice is an independent
sub-portfolio and a basket's value in BTC is the mean of its coins' values. A slice whose
coin has no price on its buy date stays in BTC (value 1.0). test_basket_lab.py checks this
shortcut against the full simulator on real baskets.
"""

from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from rotation.backtest.alt_harvest import AltRules, simulate

SLICE_DAYS = (0, 60, 120, 180)
NEVER = AltRules(1.0, 0.0, 0.10, "usd")
POOL_MAX_RANK = 200

_G: dict = {}


def _init(cf, alt, sell, buy, fee):
    _G.update(cf=cf, alt=alt, sell=sell, buy=buy, fee=fee)


def _slice_series(args) -> tuple:
    """One coin, one buy slice: daily BTC value from the slice date to `end`."""
    key, coin, start, end = args
    d = simulate(_G["cf"], _G["alt"], [coin], start, end, NEVER, _G["sell"], _G["buy"], _G["fee"])
    return key, d["btc_equiv"]


def coin_series(results: dict, coin: str, starts: list, idx: pd.DatetimeIndex) -> pd.Series:
    """Mean over the 4 slices; before its buy date (or with no price) a slice is BTC."""
    parts = []
    for s in starts:
        r = results.get((coin, s))
        parts.append(pd.Series(1.0, index=idx) if r is None else r.reindex(idx).fillna(1.0))
    return sum(parts) / len(parts)


def build_lab(cf, alt, ranks, meta, halvings, sell, buy, fee, end_today) -> dict:
    ends = [*halvings[2:], end_today]
    tasks, plan = [], {}
    for h, end in zip(halvings[1:], ends, strict=True):
        starts = [h + pd.Timedelta(days=d) for d in SLICE_DAYS]
        pool = set(ranks[ranks["date"].isin(starts) & (ranks["rank"] <= POOL_MAX_RANK)]["coin_id"])
        pool = {c for c in pool if c in alt.columns}
        plan[h] = (end, starts, sorted(pool))
        for coin in pool:
            for s in starts:
                p = alt.at[s, coin] if s in alt.index else np.nan
                if not np.isnan(p):
                    tasks.append(((coin, s), coin, s, end))

    with ProcessPoolExecutor(
        max_workers=os.cpu_count(), initializer=_init, initargs=(cf, alt, sell, buy, fee)
    ) as ex:
        results = dict(ex.map(_slice_series, tasks, chunksize=16))

    out = {
        "slice_days": list(SLICE_DAYS),
        "window_start_days": sell.window_start_days,
        "cycles": {},
        "names": {},
    }
    for h, (end, starts, pool) in plan.items():
        idx = cf.loc[h:end].index
        weekly = pd.Series(idx, index=idx).resample("W-SUN").last().dropna()
        wk = pd.DatetimeIndex(weekly.values)
        coins = {}
        for coin in pool:
            s = coin_series(results, coin, starts, idx)
            rank = ranks[(ranks["date"] == starts[0]) & (ranks["coin_id"] == coin)]["rank"]
            coins[coin] = {
                "s": [round(float(v), 3) for v in s.loc[wk]],
                "rank": int(rank.iloc[0]) if len(rank) else None,
                "slices": sum(1 for st in starts if (coin, st) in results),
            }
        # the "five largest on each buy date" rule, for comparison
        rule_parts = []
        for st in starts:
            top5 = ranks[(ranks["date"] == st) & (ranks["rank"] <= 5)].sort_values("rank")[
                "coin_id"
            ]
            vals = [results[(c, st)].reindex(idx).fillna(1.0) for c in top5 if (c, st) in results]
            rule_parts.append(sum(vals) / len(vals) if vals else pd.Series(1.0, index=idx))
        rule = sum(rule_parts) / len(rule_parts)
        top20 = ranks[(ranks["date"] == starts[0]) & (ranks["rank"] <= 20)].sort_values("rank")
        out["cycles"][str(h.year)] = {
            "halving": h.strftime("%Y-%m-%d"),
            "end": end.strftime("%Y-%m-%d"),
            "complete": end != end_today,
            "dates": [d.strftime("%Y-%m-%d") for d in wk],
            "window_date": (h + pd.Timedelta(days=sell.window_start_days - 1)).strftime("%Y-%m-%d"),
            "coins": coins,
            "rule": [round(float(v), 3) for v in rule.loc[wk]],
            "rule_top5_first_slice": list(
                ranks[(ranks["date"] == starts[0]) & (ranks["rank"] <= 5)].sort_values("rank")[
                    "coin_id"
                ]
            ),
            "top20": [c for c in top20["coin_id"] if c in coins],
        }
        for coin in pool:
            m = meta.get(coin)
            if m:
                out["names"][coin] = m
    return out
