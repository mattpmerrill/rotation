"""Benchmarks the rules are judged against, all measured in BTC.

hodl_btc     buy BTC on day one, hold
alt_index    equal-weight basket of the point-in-time top-N alts, rebalanced monthly
             (survivorship-free: dead coins stay in until they drop out of the top N)
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def hodl_btc(btc: pd.Series, start: str, end: str, usd: float, cost: float) -> pd.Series:
    b = btc.loc[start:end]
    qty = usd * (1 - cost) / b.iloc[0]
    return pd.Series(qty, index=b.index)  # BTC held, constant


def alt_index(
    ranks: pd.DataFrame,
    prices: pd.DataFrame,
    btc: pd.Series,
    start: str,
    end: str,
    top_n: int,
    cost: float,
) -> pd.Series:
    """Portfolio value in BTC of an equal-weight top-N alt basket, rebalanced on the first
    day of each month with `cost` charged on turnover."""
    wide = prices.pivot(index="date", columns="coin_id", values="price_usd").sort_index()
    wide = wide.loc[start:end]
    b = btc.reindex(wide.index)
    rk = ranks[(ranks["date"] >= start) & (ranks["date"] <= end) & (ranks["rank"] <= top_n)]
    members = rk.groupby("date")["coin_id"].apply(set)

    usd = b.iloc[0] * 1.0
    weights: dict[str, float] = {}  # coin -> qty
    out = []
    last_px: dict[str, float] = {}
    for t in wide.index:
        row = wide.loc[t]
        for c in list(weights):
            if not np.isnan(row.get(c, np.nan)):
                last_px[c] = row[c]
        usd = sum(q * last_px[c] for c, q in weights.items()) if weights else usd
        if (t.day == 1 or not weights) and t in members.index:
            target = [c for c in members[t] if not np.isnan(row.get(c, np.nan))]
            if target:
                old = {c: q * last_px[c] for c, q in weights.items()}
                each = usd / len(target)
                turnover = sum(abs(each - old.get(c, 0.0)) for c in target) + sum(
                    v for c, v in old.items() if c not in target
                )
                usd -= turnover * cost
                each = usd / len(target)
                weights = {c: each / row[c] for c in target}
                last_px.update({c: row[c] for c in target})
        out.append(usd / b.loc[t])
    return pd.Series(out, index=wide.index)
