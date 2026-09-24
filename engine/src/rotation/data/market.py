"""Build the daily market frame that rules/market.py reads.

Computed in-house, so the definitions are fixed and reproducible:
  btc_dominance    BTC market cap / total market cap of every coin with credible data
                   (stablecoins included, as in the usual BTC.D; junk caps filtered)
  altseason_index  % of the top-50 alts (on that day) whose 90D return beat BTC's
  memes_top20      meme coins among the top-20 alts
  breadth          share of the top-100 alts with ALT/BTC above its 50D SMA
"""

from __future__ import annotations

import pandas as pd

from rotation.config import get_config
from rotation.data import backfill, cache
from rotation.data.universe import drop_spikes, eligible


def _total_market_cap() -> pd.Series:
    r = get_config().universe.ranking
    df = backfill.load()
    df = df[(df["coin_id"] != "bitcoin") & (df["market_cap_usd"] > 0)]
    df = df[eligible(df, r.volume_window_days, r.min_volume_days, r.min_turnover)]
    df = drop_spikes(df)
    return df.groupby("date")["market_cap_usd"].sum()


def _altseason(ranks: pd.DataFrame, px: pd.DataFrame, btc: pd.Series, days: int) -> pd.Series:
    wide = px.pivot(index="date", columns="coin_id", values="price_usd").sort_index()
    ret = wide / wide.shift(days) - 1
    btc_ret = btc / btc.shift(days) - 1
    beat = ret.gt(btc_ret, axis=0) & ret.notna()
    top = ranks[ranks["rank"] <= 50]
    top = top[top["coin_id"].isin(wide.columns)]
    beat_long = beat.stack().rename("beat").reset_index()
    j = top.merge(beat_long, on=["date", "coin_id"], how="left")
    has = j.merge(ret.notna().stack().rename("has").reset_index(), on=["date", "coin_id"])
    has = has[has["has"]]
    return has.groupby("date")["beat"].mean() * 100


def _breadth(ranks: pd.DataFrame, px: pd.DataFrame, btc: pd.Series, n: int) -> pd.Series:
    wide = px.pivot(index="date", columns="coin_id", values="price_usd").sort_index()
    ratio = wide.div(btc.reindex(wide.index), axis=0)
    above = (ratio > ratio.rolling(n, min_periods=n).mean()).where(
        ratio.rolling(n, min_periods=n).mean().notna()
    )
    long = above.stack().rename("above").reset_index()
    top = ranks[ranks["rank"] <= 100].merge(long, on=["date", "coin_id"])
    return top.groupby("date")["above"].mean()


def _memes(ranks: pd.DataFrame) -> pd.Series:
    u = get_config().universe
    cats = cache.read("coingecko_meta", "categories")
    meme_cats = {c.casefold() for c in u.meme_categories}
    memes = {
        cid
        for cid, cs in zip(cats["coin_id"], cats["categories"], strict=True)
        if any(c.strip().casefold() in meme_cats for c in cs)
    } | set(u.meme_ids)
    top = ranks[ranks["rank"] <= 20]
    return top.assign(meme=top["coin_id"].isin(memes)).groupby("date")["meme"].sum()


def build_market() -> pd.DataFrame:
    cfg = get_config().rules
    ranks = cache.read("universe", "ranks")
    px = cache.read("universe", "prices")
    onchain = cache.read("coinmetrics", "btc").set_index("date")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    alts = px[px["coin_id"] != "bitcoin"]

    m = pd.DataFrame(index=btc.index)
    m["btc_close"] = btc
    m["btc_mcap"] = onchain["market_cap_usd"]
    m["btc_realized_cap"] = onchain["realized_cap_usd"]
    total = _total_market_cap()
    m["btc_dominance"] = m["btc_mcap"] / (m["btc_mcap"] + total.reindex(m.index)) * 100
    m.loc[total.reindex(m.index).isna(), "btc_dominance"] = float("nan")

    funding = cache.read("universe", "funding").pivot(
        index="date", columns="coin_id", values="funding_8h"
    )
    m["funding_btc"] = funding.get("bitcoin")
    m["funding_eth"] = funding.get("ethereum")

    m["altseason_index"] = _altseason(ranks, alts, btc, cfg.flags.altseason_window_days)
    m["memes_top20"] = _memes(ranks)
    m["breadth"] = _breadth(ranks, alts, btc, cfg.universe.altbtc_sma_days)
    m.index.name = "date"
    cache.write(m.reset_index(), "universe", "market")
    return m
