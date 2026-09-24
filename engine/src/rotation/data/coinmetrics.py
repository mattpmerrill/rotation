"""CoinMetrics Community API (free, no key): BTC market cap and MVRV ratio since 2010.

Realized cap is derived as market_cap / mvrv. MVRV Z-score itself is computed in
rules/flags.py, not here: the data layer stores raw inputs only.
"""

from __future__ import annotations

import httpx
import pandas as pd

from rotation.data import cache, http

URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
METRICS = {"CapMrktCurUSD": "market_cap_usd", "CapMVRVCur": "mvrv"}


def parse(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    out = pd.DataFrame(
        {"date": pd.to_datetime(df["time"], utc=True).dt.normalize().dt.tz_localize(None)}
    )
    for src, dst in METRICS.items():
        out[dst] = pd.to_numeric(df[src], errors="coerce")
    out["realized_cap_usd"] = out["market_cap_usd"] / out["mvrv"]
    return out


def fetch_btc_onchain(c: httpx.Client, start: str = "2010-07-18") -> pd.DataFrame:
    params: dict | None = {
        "assets": "btc",
        "metrics": ",".join(METRICS),
        "frequency": "1d",
        "start_time": start,
        "page_size": 10000,
    }
    url, rows = URL, []
    while url:
        body = http.get(c, url, params=params).json()
        rows.extend(body["data"])
        url, params = body.get("next_page_url"), None  # next_page_url carries its own params
    return cache.upsert(parse(rows), "coinmetrics", "btc")


CATALOG_URL = "https://community-api.coinmetrics.io/v4/catalog-v2/asset-metrics"


def price_assets(c: httpx.Client) -> list[str]:
    """Assets with a free daily PriceUSD series."""
    body = http.get(c, CATALOG_URL, params={"metrics": "PriceUSD", "page_size": 10000}).json()
    return sorted(a["asset"] for a in body["data"])


def fetch_prices(c: httpx.Client, assets: list[str], start: str = "2010-07-18") -> pd.DataFrame:
    """Daily PriceUSD (close of the stamped UTC day, same convention as Binance) for assets.
    Cached as one frame: asset, date, price_usd."""
    rows: list[dict] = []
    for i in range(0, len(assets), 20):  # keep URLs short
        url, params = (
            URL,
            {
                "assets": ",".join(assets[i : i + 20]),
                "metrics": "PriceUSD",
                "frequency": "1d",
                "start_time": start,
                "page_size": 10000,
            },
        )
        while url:
            body = http.get(c, url, params=params).json()
            rows.extend(body["data"])
            url, params = body.get("next_page_url"), None
    df = pd.DataFrame(rows)
    out = pd.DataFrame(
        {
            "asset": df["asset"],
            "date": pd.to_datetime(df["time"], utc=True).dt.normalize().dt.tz_localize(None),
            "price_usd": pd.to_numeric(df["PriceUSD"], errors="coerce"),
        }
    ).dropna()
    cache.write(out, "coinmetrics", "prices")
    return out
