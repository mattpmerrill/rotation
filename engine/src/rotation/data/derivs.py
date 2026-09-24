"""Binance USD-M perpetuals -> coins, then funding and open interest per coin.

A futures ticker is not an identity: some carry a price multiplier (1000PEPEUSDT is
per 1,000 PEPE), some are renamed successors (LUNA2USDT), and tickers get reused.
So a ticker maps to a coin only if its first AND last month of daily closes agree with
the coin's price panel (median error < 3%, after the multiplier).

Funding and OI are per-unit-free (a rate, and a USD value), so multipliers do not
touch them once the mapping is right.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor

import httpx
import pandas as pd

from rotation.data import binance_archive as ba
from rotation.data import cache, http

log = logging.getLogger(__name__)

MULTIPLIER = re.compile(r"^(1000000|1000|1M)(?=[A-Z])")
MULT_VALUE = {"1000000": 1_000_000, "1000": 1_000, "1M": 1_000_000}
MAX_MEDIAN_ERR = 0.03


def parse_symbol(symbol: str) -> tuple[str, int] | None:
    """'1000PEPEUSDT' -> ('PEPE', 1000). Non-USDT symbols -> None."""
    if not symbol.endswith("USDT"):
        return None
    base = symbol[: -len("USDT")]
    m = MULTIPLIER.match(base)
    if m:
        return base[m.end() :], MULT_VALUE[m.group(1)]
    return base, 1


def candidate_coins(base: str, by_symbol: dict[str, list[str]]) -> list[str]:
    """Coins whose CoinGecko symbol matches the base, also trying without a trailing
    version digit (LUNA2 -> luna)."""
    b = base.lower()
    out = list(by_symbol.get(b, []))
    stripped = b.rstrip("0123456789")
    if stripped != b:
        out += by_symbol.get(stripped, [])
    return out


def agrees(fut: pd.DataFrame, panel: pd.Series, mult: int) -> bool:
    """fut: date, close. panel: price by date for one coin."""
    j = pd.concat(
        [fut.set_index("date")["close"].rename("fut"), (panel * mult).rename("ref")], axis=1
    ).dropna()
    if len(j) < 10:
        return False
    return (j["fut"] / j["ref"] - 1).abs().median() < MAX_MEDIAN_ERR


def _month_klines(c: httpx.Client, symbol: str, month: str) -> pd.DataFrame | None:
    key = f"data/futures/um/monthly/klines/{symbol}/1d/{symbol}-1d-{month}.zip"
    raw = ba._download_csv(c, key)
    return None if raw is None else ba.parse_klines(raw)


MIN_OVERLAP = 10
MAX_MONTHS = 6


def _overlap(keys, month, panel: pd.Series, from_end: bool) -> pd.DataFrame | None:
    """Klines from one end of the ticker's life, month by month, until they overlap the
    panel on MIN_OVERLAP days (or MAX_MONTHS were tried)."""
    order = keys[::-1] if from_end else keys
    got: list[pd.DataFrame] = []
    for k in order[:MAX_MONTHS]:
        m = month(k)
        if m is None:
            continue
        got.append(m)
        df = pd.concat(got, ignore_index=True)
        if df["date"].isin(panel.index).sum() >= MIN_OVERLAP:
            return df
    return None


def map_symbol(
    c: httpx.Client, symbol: str, prices: pd.DataFrame, by_symbol: dict[str, list[str]]
) -> dict | None:
    parsed = parse_symbol(symbol)
    if not parsed:
        return None
    base, mult = parsed
    coins = candidate_coins(base, by_symbol)
    if not coins:
        return None
    keys = ba._zip_keys(c, f"data/futures/um/monthly/klines/{symbol}/1d/")
    if not keys:
        return None
    first_m, last_m = ba._month_of(keys[0]), ba._month_of(keys[-1])
    months: dict[str, pd.DataFrame | None] = {}

    def month(k: str) -> pd.DataFrame | None:
        if k not in months:
            months[k] = _month_klines(c, symbol, ba._month_of(k))
        return months[k]

    for coin in coins:
        panel = prices.loc[coin] if coin in prices.index.get_level_values(0) else None
        if panel is None:
            continue
        # Check both ends of the ticker's life where it overlaps the coin's prices. Walk in
        # from each end: a listing month can be 1-2 days (ADA, HYPE), a ticker can start
        # before CoinGecko data (NEAR) or outlive it (MKR after the SKY migration).
        head = _overlap(keys, month, panel, from_end=False)
        tail = _overlap(keys, month, panel, from_end=True)
        if (
            head is not None
            and tail is not None
            and agrees(head, panel, mult)
            and agrees(tail, panel, mult)
        ):
            return {
                "symbol": symbol,
                "coin_id": coin,
                "multiplier": mult,
                "first_month": first_m,
                "last_month": last_m,
            }
    log.info("no validated coin for %s (candidates %s)", symbol, coins)
    return None


def build_map(prices: pd.DataFrame, symbols: dict[str, str], workers: int = 8) -> pd.DataFrame:
    """prices: the universe price panel. symbols: coin_id -> CoinGecko symbol."""
    by_symbol: dict[str, list[str]] = {}
    for coin_id, sym in symbols.items():
        by_symbol.setdefault(sym.lower(), []).append(coin_id)
    idx = prices.set_index(["coin_id", "date"])["price_usd"]

    with http.client() as c:
        futs = [
            p.rstrip("/").rsplit("/", 1)[-1]
            for p in ba._list(c, "data/futures/um/monthly/fundingRate/", "Prefix")
        ]
        futs = [s for s in futs if (p := parse_symbol(s)) and candidate_coins(p[0], by_symbol)]
        with ThreadPoolExecutor(workers) as ex:
            rows = [r for r in ex.map(lambda s: map_symbol(c, s, idx, by_symbol), futs) if r]
    df = pd.DataFrame(rows)
    cache.write(df, "universe", "futures_map")
    return df


def fetch_funding_all(fmap: pd.DataFrame, workers: int = 8) -> pd.DataFrame:
    """Funding for every mapped symbol, combined per coin (mean across a coin's symbols)."""
    with http.client() as c, ThreadPoolExecutor(workers) as ex:
        frames = list(ex.map(lambda s: ba.fetch_funding(c, s), fmap["symbol"]))
    parts = [
        f.assign(coin_id=coin)
        for f, coin in zip(frames, fmap["coin_id"], strict=True)
        if f is not None and len(f)
    ]
    df = pd.concat(parts, ignore_index=True)
    out = df.groupby(["coin_id", "date"], as_index=False)["funding_8h"].mean()
    cache.write(out, "universe", "funding")
    return out


def oi_days_needed(fmap: pd.DataFrame, ranks: pd.DataFrame, lookback: int = 7) -> dict[str, list]:
    """symbol -> sorted dates: every day the coin is top 100 since the archive starts,
    plus the `lookback` days before each (for the 7-day OI change)."""
    coin_to_symbol = dict(zip(fmap["coin_id"], fmap["symbol"], strict=True))
    t = ranks[(ranks["rank"] <= 100) & ranks["coin_id"].isin(coin_to_symbol)]
    t = t[t["date"] >= "2020-09-01"]
    out: dict[str, list] = {}
    for coin, g in t.groupby("coin_id"):
        days = pd.DatetimeIndex(g["date"])
        shifted = [days - pd.Timedelta(days=k) for k in range(lookback + 1)]
        out[coin_to_symbol[coin]] = sorted(set().union(*shifted))
    return out


def fetch_oi(needed: dict[str, list], workers: int = 16) -> None:
    """Download daily OI files, one symbol at a time (resumable: cached days are skipped)."""
    with http.client() as c, ThreadPoolExecutor(workers) as ex:
        for i, (symbol, days) in enumerate(sorted(needed.items()), 1):
            cached = cache.read("binance_oi", symbol)
            have = set() if cached is None else set(cached["date"])
            todo = [d for d in days if d not in have]
            if not todo:
                continue

            def one(d, symbol=symbol):
                key = (
                    f"data/futures/um/daily/metrics/{symbol}/"
                    f"{symbol}-metrics-{d.date().isoformat()}.zip"
                )
                raw = ba._download_csv(c, key)
                return None if raw is None else ba.parse_metrics(raw)

            frames = [f for f in ex.map(one, todo) if f is not None and len(f)]
            if frames:
                cache.upsert(pd.concat(frames, ignore_index=True), "binance_oi", symbol)
            log.warning(
                "oi %d/%d %s: %d of %d days", i, len(needed), symbol, len(frames), len(todo)
            )


def combine_oi(fmap: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for symbol, coin in zip(fmap["symbol"], fmap["coin_id"], strict=True):
        df = cache.read("binance_oi", symbol)
        if df is not None and len(df):
            parts.append(df.assign(coin_id=coin)[["coin_id", "date", "oi_usd"]])
    out = pd.concat(parts, ignore_index=True)
    out = out[out["oi_usd"] > 0]  # zero/negative OI rows are archive errors, not data
    cache.write(out, "universe", "open_interest")
    return out
