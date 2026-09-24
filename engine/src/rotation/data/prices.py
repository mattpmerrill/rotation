"""The price panel the backtest reads: one close per (coin_id, date), best source first.

Sources, in order of preference:
  1. CoinMetrics reference rate (cross-exchange; free for ~140 assets, 58 of them pre-2018)
  2. CoinGecko daily (all coins incl. dead; noisy in 2017-18: BTC p99 error 12-21% vs Binance)

CoinMetrics overrides CoinGecko for BTC on every date (the flags need a reference BTC
price), and for alts only before 2019, where CoinGecko is unreliable. After 2019
CoinGecko is fine, and some CoinMetrics alt series are pre-migration ERC-20 tokens
(e.g. qtum_eth) that can go stale once the coin moves to its own chain.

CoinMetrics assets are matched to CoinGecko ids by symbol, then accepted only if the two
price series agree (median abs error < 2% over 2019+, where CoinGecko is reliable). Ticker
symbols are not identities, so an unvalidated match is never used.
"""

from __future__ import annotations

import pandas as pd

MAX_MEDIAN_ERR = 0.02
VALIDATE_FROM = "2019-01-01"
MIN_OVERLAP_DAYS = 90


def match_coinmetrics(
    cm: pd.DataFrame, cg: pd.DataFrame, cg_symbols: dict[str, str]
) -> dict[str, str]:
    """Map CoinMetrics asset -> CoinGecko coin_id, validated by price agreement.

    cm: asset, date, price_usd. cg: coin_id, date, price_usd. cg_symbols: coin_id -> symbol.
    Where several CoinMetrics assets fit one coin (e.g. 'eos' and 'eos_eth'), the one with
    the lowest median error wins."""
    by_symbol: dict[str, list[str]] = {}
    for coin_id, sym in cg_symbols.items():
        by_symbol.setdefault(sym.lower(), []).append(coin_id)

    cg_idx = cg[cg["date"] >= VALIDATE_FROM].set_index(["coin_id", "date"])["price_usd"]
    best: dict[str, tuple[float, str]] = {}  # coin_id -> (err, asset)
    for asset, s in cm[cm["date"] >= VALIDATE_FROM].groupby("asset"):
        base = asset.split("_")[0]
        for coin_id in by_symbol.get(base, []):
            if coin_id not in cg_idx.index.get_level_values(0):
                continue
            ref = cg_idx.loc[coin_id]
            j = pd.concat(
                [s.set_index("date")["price_usd"].rename("cm"), ref.rename("cg")], axis=1
            ).dropna()
            if len(j) < MIN_OVERLAP_DAYS:
                continue
            err = (j["cm"] / j["cg"] - 1).abs().median()
            if err < MAX_MEDIAN_ERR and err < best.get(coin_id, (1.0, ""))[0]:
                best[coin_id] = (err, asset)
    return {asset: coin_id for coin_id, (_, asset) in best.items()}


ALWAYS_COINMETRICS = {"bitcoin"}


def build_panel(cg: pd.DataFrame, cm: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """coin_id, date, price_usd, source. CoinMetrics wins where it is allowed to (see above)."""
    cm_rows = cm[cm["asset"].isin(mapping)].assign(coin_id=lambda d: d["asset"].map(mapping))
    allowed = cm_rows["coin_id"].isin(ALWAYS_COINMETRICS) | (cm_rows["date"] < VALIDATE_FROM)
    cm_rows = cm_rows[allowed]
    cm_rows = cm_rows[["coin_id", "date", "price_usd"]].assign(source="coinmetrics")
    cg_rows = cg[["coin_id", "date", "price_usd"]].dropna().assign(source="coingecko")
    both = pd.concat([cm_rows, cg_rows], ignore_index=True)
    # stable sort keeps coinmetrics (first) ahead of coingecko on the same key
    both = both.sort_values(["coin_id", "date"], kind="stable")
    return both.drop_duplicates(["coin_id", "date"], keep="first").reset_index(drop=True)
