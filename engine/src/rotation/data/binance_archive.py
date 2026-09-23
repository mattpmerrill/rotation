"""Binance public data archive (data.binance.vision): free, bulk, keeps delisted pairs.

Used for backtest history:
  - spot daily klines (monthly zips), from 2017-08 for the oldest pairs
  - USD-M perp funding rates (monthly zips), from ~2020-01
  - USD-M perp open interest (daily "metrics" zips of 5-minute snapshots), from ~2020-09

Monthly files only cover completed months. The live engine tops up the current
month from ccxt; this module is for history.

Format gotchas handled here:
  - spot kline timestamps switched from milliseconds to microseconds in 2025
  - futures files carry a header row; spot files do not
"""

from __future__ import annotations

import io
import re
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd

from rotation.data import cache, http

LIST_URL = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
FILE_URL = "https://data.binance.vision"

KLINE_COLS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
    "taker_base",
    "taker_quote",
    "ignore",
]


# --- listing ------------------------------------------------------------------


def _list(c: httpx.Client, prefix: str, tag: str) -> Iterator[str]:
    """Yield <Key> or <Prefix> values under an S3 prefix, following pagination."""
    marker = ""
    while True:
        r = http.get(c, LIST_URL, params={"delimiter": "/", "prefix": prefix, "marker": marker})
        body = r.text
        items = re.findall(rf"<{tag}>([^<]+)</{tag}>", body)
        if tag == "Prefix":
            items = [i for i in items if i != prefix]
        yield from items
        if "<IsTruncated>true</IsTruncated>" not in body:
            return
        nxt = re.search(r"<NextMarker>([^<]+)</NextMarker>", body)
        marker = nxt.group(1) if nxt else items[-1]


def list_spot_symbols(c: httpx.Client, quote: str = "USDT") -> list[str]:
    prefixes = _list(c, "data/spot/monthly/klines/", "Prefix")
    syms = [p.rstrip("/").rsplit("/", 1)[-1] for p in prefixes]
    return sorted(s for s in syms if s.endswith(quote))


def _zip_keys(c: httpx.Client, prefix: str) -> list[str]:
    return sorted(k for k in _list(c, prefix, "Key") if k.endswith(".zip"))


def _download_csv(c: httpx.Client, key: str) -> bytes | None:
    r = http.get(c, f"{FILE_URL}/{key}")
    if r.status_code == 404:
        return None
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        return z.read(z.namelist()[0])


# --- parsing (pure) -----------------------------------------------------------


def _to_utc(ts: pd.Series) -> pd.Series:
    """Epoch timestamps in ms or us (Binance switched spot to us in 2025) -> UTC datetime."""
    ts = ts.astype("int64")
    unit_us = ts > 10**14
    out = pd.Series(pd.NaT, index=ts.index, dtype="datetime64[ns, UTC]")
    out[~unit_us] = pd.to_datetime(ts[~unit_us], unit="ms", utc=True)
    out[unit_us] = pd.to_datetime(ts[unit_us], unit="us", utc=True)
    return out


def _has_header(raw: bytes) -> bool:
    first = raw.split(b",", 1)[0].strip()
    return not first.lstrip(b"-").isdigit()


def parse_klines(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(
        io.BytesIO(raw), header=None, names=KLINE_COLS, skiprows=1 if _has_header(raw) else 0
    )
    out = pd.DataFrame({"date": _to_utc(df["open_time"]).dt.normalize().dt.tz_localize(None)})
    for col in ("open", "high", "low", "close", "volume", "quote_volume"):
        out[col] = df[col].astype("float64")
    return out


def parse_funding(raw: bytes) -> pd.DataFrame:
    """Funding events -> one row per UTC day: mean 8h-equivalent rate and event count."""
    df = pd.read_csv(io.BytesIO(raw))
    ts = _to_utc(df["calc_time"])
    hours = df.get("funding_interval_hours", pd.Series(8, index=df.index)).astype("float64")
    rate_8h = df["last_funding_rate"].astype("float64") * (8.0 / hours)
    daily = (
        pd.DataFrame({"date": ts.dt.normalize().dt.tz_localize(None), "funding_8h": rate_8h})
        .groupby("date", as_index=False)
        .agg(funding_8h=("funding_8h", "mean"), events=("funding_8h", "size"))
    )
    return daily


def parse_metrics(raw: bytes) -> pd.DataFrame:
    """5-minute OI snapshots -> the last snapshot of each UTC day (end-of-day OI)."""
    df = pd.read_csv(io.BytesIO(raw), parse_dates=["create_time"])
    df = df.sort_values("create_time")
    last = df.groupby(df["create_time"].dt.normalize()).tail(1)
    return pd.DataFrame(
        {
            "date": last["create_time"].dt.normalize().to_numpy(),
            "oi_base": last["sum_open_interest"].astype("float64").to_numpy(),
            "oi_usd": last["sum_open_interest_value"].astype("float64").to_numpy(),
        }
    )


# --- fetchers (incremental) ---------------------------------------------------


def _month_of(key: str) -> str:
    m = re.search(r"(\d{4}-\d{2})\.zip$", key)
    assert m, key
    return m.group(1)


def _fetch_monthly(
    c: httpx.Client, prefix: str, dataset: str, symbol: str, parser
) -> pd.DataFrame | None:
    cached = cache.read(dataset, symbol)
    # Re-fetch the last cached month in case it was cached before the month closed.
    since = cached["date"].max().strftime("%Y-%m") if cached is not None and len(cached) else ""
    frames = []
    for key in _zip_keys(c, prefix):
        if _month_of(key) < since:
            continue
        raw = _download_csv(c, key)
        if raw:
            frames.append(parser(raw))
    if not frames:
        return cached
    return cache.upsert(pd.concat(frames, ignore_index=True), dataset, symbol)


def fetch_spot_klines(c: httpx.Client, symbol: str) -> pd.DataFrame | None:
    return _fetch_monthly(
        c, f"data/spot/monthly/klines/{symbol}/1d/", "binance_spot_1d", symbol, parse_klines
    )


def fetch_funding(c: httpx.Client, symbol: str) -> pd.DataFrame | None:
    return _fetch_monthly(
        c,
        f"data/futures/um/monthly/fundingRate/{symbol}/",
        "binance_funding",
        symbol,
        parse_funding,
    )


def fetch_open_interest(
    c: httpx.Client, symbol: str, start: date | None = None, end: date | None = None
) -> pd.DataFrame | None:
    """One request per day, so only fetch the window you need. Resumes from the cache."""
    dataset = "binance_oi"
    cached = cache.read(dataset, symbol)
    if cached is not None and len(cached):
        start = max(start or date.min, cached["date"].max().date() + timedelta(days=1))
    if start is None:
        keys = _zip_keys(c, f"data/futures/um/daily/metrics/{symbol}/")
        if not keys:
            return cached
        start = date.fromisoformat(re.search(r"(\d{4}-\d{2}-\d{2})\.zip$", keys[0]).group(1))
    end = end or datetime.now(UTC).date() - timedelta(days=1)

    frames = []
    d = start
    while d <= end:
        key = f"data/futures/um/daily/metrics/{symbol}/{symbol}-metrics-{d.isoformat()}.zip"
        raw = _download_csv(c, key)
        if raw:
            frames.append(parse_metrics(raw))
        d += timedelta(days=1)
    if not frames:
        return cached
    return cache.upsert(pd.concat(frames, ignore_index=True), dataset, symbol)
