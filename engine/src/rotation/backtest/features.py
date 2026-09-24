"""Per-coin daily features for the simulator: the rule functions applied to history.

Same functions the live engine calls (rules/score.py), so the backtest tests exactly
what will run. One long frame: coin_id, date, close, sma20, rank, gate columns, score
points, score, stop, target, reward_risk, size.
"""

from __future__ import annotations

import pandas as pd

from rotation.config import Config
from rotation.data import backfill, cache
from rotation.rules.indicators import sma
from rotation.rules.score import SCORE_POINTS, entry_plan, gates, score


def coin_frames(start: str = "2016-01-01"):
    """Yield (coin_id, daily input frame) for every ranked coin."""
    ranks = cache.read("universe", "ranks")
    px = cache.read("universe", "prices")
    vol = backfill.load()[["coin_id", "date", "volume_usd"]]
    funding = cache.read("universe", "funding")
    oi = cache.read("universe", "open_interest")

    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    coins = sorted(set(ranks["coin_id"]))
    by = {
        "px": px[px["coin_id"].isin(coins)].groupby("coin_id"),
        "vol": vol[vol["coin_id"].isin(coins)].groupby("coin_id"),
        "rank": ranks.groupby("coin_id"),
        "funding": funding.groupby("coin_id"),
        "oi": oi.groupby("coin_id") if oi is not None else None,
    }
    for coin in coins:
        p = by["px"].get_group(coin).set_index("date")["price_usd"].sort_index()
        p = p[p.index >= start]
        if len(p) < 30:
            continue
        df = pd.DataFrame({"close": p})
        df["btc_close"] = btc.reindex(df.index)
        df["volume_usd"] = by["vol"].get_group(coin).set_index("date")["volume_usd"]
        df["rank"] = by["rank"].get_group(coin).set_index("date")["rank"]
        if coin in by["funding"].groups:
            df["funding_8h"] = by["funding"].get_group(coin).set_index("date")["funding_8h"]
        if by["oi"] is not None and coin in by["oi"].groups:
            df["oi_usd"] = by["oi"].get_group(coin).set_index("date")["oi_usd"]
        yield coin, df


def build_features(cfg: Config) -> pd.DataFrame:
    r = cfg.rules
    parts = []
    for coin, df in coin_frames():
        g = gates(df, r.universe)
        s = score(df, r.score)
        e = entry_plan(df, s, r.score, r.entry)
        out = pd.concat(
            [
                df[["close", "rank"]],
                sma(df["close"], r.ladder.runner.trail_sma_days).rename("sma20"),
                g[["passes", "passes_ex_altbtc", "unknown_gates"]].rename(
                    columns={"passes": "gates_pass", "passes_ex_altbtc": "gates_pass_ex_altbtc"}
                ),
                g[["altbtc"]],
                s[[*SCORE_POINTS, "score"]],
                e,
            ],
            axis=1,
        )
        parts.append(out.assign(coin_id=coin).reset_index(names="date"))
    feats = pd.concat(parts, ignore_index=True)
    return feats
