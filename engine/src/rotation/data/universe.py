"""Point-in-time market-cap ranks from the CoinGecko backfill.

Two passes, because exclusion needs categories and categories cost one call per coin:
  1. rank every coin by raw market cap; coins that were ever in the raw top N are candidates
  2. fetch categories for candidates only, drop stables/wrapped/LSTs, rank again

CoinGecko market caps have occasional one-day spikes (bad supply data). A spike can
push a coin into the top 100 for a day, so days that jump 5x away from the coin's
centered 7-day median are ignored for ranking.
"""

from __future__ import annotations

import pandas as pd

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


def rank_by_day(df: pd.DataFrame, exclude: set[str] = frozenset()) -> pd.DataFrame:
    """Rank coins by market cap within each date (1 = largest). Ties broken by coin_id."""
    df = df[~df["coin_id"].isin(exclude) & (df["market_cap_usd"] > 0)]
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
    exclude_keywords: list[str],
    exclude_ids: list[str],
) -> bool:
    """Excluded if listed by id, or if any category contains an exclusion keyword.

    Matched loosely on purpose: a false exclusion costs one coin, a false inclusion puts a
    stablecoin in the top 100."""
    if coin_id in exclude_ids:
        return True
    slugs = [_slug(c) for c in categories]
    return any(k in s for k in exclude_keywords for s in slugs)


def _slug(s: str) -> str:
    return "-".join(s.lower().replace("(", " ").replace(")", " ").split())


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

    candidates = ever_in_top(
        rank_by_day(df[["coin_id", "date", "market_cap_usd"]]), CANDIDATE_RAW_TOP
    )

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
        if is_excluded(c, list(cat_map.get(c, [])), u.exclude_category_keywords, u.exclude_ids)
    }

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
