"""Point-in-time market-cap ranks from the CoinGecko backfill.

Two passes, because exclusion needs categories and categories cost one call per coin:
  1. rank every coin by raw market cap; coins that were ever in the raw top N are candidates
  2. fetch categories for candidates only, drop stables/wrapped/LSTs, rank again

CoinGecko market caps have two kinds of bad data, both filtered before ranking:
  - one-day spikes: days 5x away from the coin's centered 7-day median are ignored
  - impossible caps on dead markets (e.g. $2.9e21 on $563 of volume): a coin is only
    ranked on days it has enough volume history and a believable volume/market-cap ratio
"""

from __future__ import annotations

from collections.abc import Sequence
from collections.abc import Set as AbstractSet

import pandas as pd

from rotation.config import PegDetector, Ranking

SPIKE_WINDOW = 7
SPIKE_RATIO = 5.0


def drop_spikes(df: pd.DataFrame, col: str = "market_cap_usd") -> pd.DataFrame:
    """Remove single-day outliers per coin. Expects columns coin_id, date, `col`."""
    df = df.sort_values(["coin_id", "date"])
    med = df.groupby("coin_id")[col].transform(
        lambda s: s.rolling(SPIKE_WINDOW, center=True, min_periods=3).median()
    )
    ratio = df[col] / med
    keep = ratio.between(1 / SPIKE_RATIO, SPIKE_RATIO) | med.isna()
    return df[keep]


def eligible(
    df: pd.DataFrame, window: int = 30, min_days: int = 20, min_turnover: float = 0.0001
) -> pd.Series:
    """True on days a coin looks like a real market: volume reported on `min_days` of the
    last `window` days, and median volume / market cap >= `min_turnover`. Index-aligned."""
    df = df.sort_values(["coin_id", "date"])
    vol = df["volume_usd"].where(df["volume_usd"] > 0)
    g = vol.groupby(df["coin_id"])
    n = g.transform(lambda s: s.rolling(window, min_periods=1).count())
    med = g.transform(lambda s: s.rolling(window, min_periods=1).median())
    return (n >= min_days) & (med / df["market_cap_usd"] >= min_turnover)


def rank_by_day(
    df: pd.DataFrame, exclude: AbstractSet[str] = frozenset(), ranking: Ranking | None = None
) -> pd.DataFrame:
    """Rank coins by market cap within each date (1 = largest). Ties broken by coin_id.

    `ranking` is the universe.yaml ranking config; defaults to the loaded config."""
    if ranking is None:
        from rotation.config import get_config

        ranking = get_config().universe.ranking
    df = df[~df["coin_id"].isin(exclude) & (df["market_cap_usd"] > 0)]
    df = df[eligible(df, ranking.volume_window_days, ranking.min_volume_days, ranking.min_turnover)]
    df = drop_spikes(df)
    df = df.sort_values(["date", "market_cap_usd", "coin_id"], ascending=[True, False, True])
    df = df.assign(rank=df.groupby("date").cumcount() + 1)
    return df.reset_index(drop=True)


def ever_in_top(ranked: pd.DataFrame, n: int, since: str | None = None) -> set[str]:
    r = ranked if since is None else ranked[ranked["date"] >= since]
    return set(r.loc[r["rank"] <= n, "coin_id"])


def is_excluded(
    coin_id: str,
    categories: list[str],
    exclude_categories: list[str],
    exclude_ids: list[str],
    force_include_ids: Sequence[str] = (),
) -> bool:
    """Excluded if listed by id, or if any category exactly matches (case-insensitive).
    force_include_ids wins over categories, but not over exclude_ids."""
    if coin_id in exclude_ids:
        return True
    if coin_id in force_include_ids:
        return False
    wanted = {c.strip().casefold() for c in exclude_categories}
    return any(c.strip().casefold() in wanted for c in categories)


def pegged_coins(df: pd.DataFrame, peg: PegDetector) -> set[str]:
    """Coins whose price sat flat inside the peg band on most of their days: stablecoins
    that CoinGecko never categorised. Expects coin_id, date, price_usd."""
    df = df.sort_values(["coin_id", "date"])
    g = df.groupby("coin_id")["price_usd"]
    hi = g.transform(lambda s: s.rolling(peg.window_days, min_periods=peg.window_days).max())
    lo = g.transform(lambda s: s.rolling(peg.window_days, min_periods=peg.window_days).min())
    lo_band, hi_band = peg.price_band
    flat = (hi / lo - 1 < peg.max_range) & df["price_usd"].between(lo_band, hi_band)
    share = flat.groupby(df["coin_id"]).mean()
    return {str(coin_id) for coin_id, s in share.items() if s >= peg.min_share_of_days}


# --- build (I/O) --------------------------------------------------------------

CANDIDATE_RAW_TOP = 200  # generous: exclusions remove ~15-25 of the raw top 100 on a given day


def build_ranks(since: str = "2016-01-01") -> pd.DataFrame:
    """Backfill -> point-in-time ranks (ex excluded coins), plus an exclusion audit CSV.

    Categories are fetched only for coins that were ever in the raw top 200, and cached.
    """
    from rotation.config import get_config
    from rotation.data import backfill, cache
    from rotation.data.coingecko import CoinGecko

    u = get_config().universe
    df = backfill.load()
    df = df[df["date"] >= since][["coin_id", "date", "market_cap_usd", "price_usd", "volume_usd"]]

    candidates = ever_in_top(rank_by_day(df), CANDIDATE_RAW_TOP)

    cats = cache.read("coingecko_meta", "categories")
    have = set() if cats is None else set(cats["coin_id"])
    missing = sorted(candidates - have)
    if missing:
        cg = CoinGecko()
        new = pd.DataFrame(
            {"coin_id": missing, "categories": [cg.coin_categories(c) for c in missing]}
        )
        cats = new if cats is None else pd.concat([cats, new], ignore_index=True)
        cache.write(cats, "coingecko_meta", "categories")

    cats = cats[cats["coin_id"].isin(candidates)]
    cat_map = dict(zip(cats["coin_id"], cats["categories"], strict=True))
    excluded = {
        c
        for c in candidates
        if is_excluded(
            c, list(cat_map.get(c, [])), u.exclude_categories, u.exclude_ids, u.force_include_ids
        )
    }
    excluded |= pegged_coins(df[df["coin_id"].isin(candidates)], u.peg_detector) - set(
        u.force_include_ids
    )

    ranked = rank_by_day(df[df["coin_id"].isin(candidates)], exclude=excluded)
    ranked = ranked[ranked["rank"] <= CANDIDATE_RAW_TOP]
    cache.write(ranked, "universe", "ranks")

    # Audit: every excluded coin that would otherwise have made the top 100, for human review.
    best = rank_by_day(df[df["coin_id"].isin(candidates)]).groupby("coin_id")["rank"].min()
    audit = pd.DataFrame(
        {
            "coin_id": sorted(excluded),
            "best_raw_rank": [best.get(c) for c in sorted(excluded)],
            "categories": ["; ".join(cat_map.get(c, [])) for c in sorted(excluded)],
        }
    ).sort_values("best_raw_rank")
    audit.to_csv(cache.data_dir() / "universe" / "excluded_audit.csv", index=False)
    return ranked
