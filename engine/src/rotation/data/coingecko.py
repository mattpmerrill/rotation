"""CoinGecko: point-in-time market caps, volumes and categories.

The historical backfill (daily data before the last 2 years, and inactive/dead
coins via status=inactive) needs the Analyst plan or above. Demo works for
recent data. Set COINGECKO_API_KEY and COINGECKO_PLAN (demo | pro) in .env.
"""

from __future__ import annotations

import os
import threading
import time
from datetime import UTC, datetime

import pandas as pd

from rotation.data import cache, http

BASE = {"demo": "https://api.coingecko.com/api/v3", "pro": "https://pro-api.coingecko.com/api/v3"}
HEADER = {"demo": "x-cg-demo-api-key", "pro": "x-cg-pro-api-key"}
CALLS_PER_MIN = {"demo": 28, "pro": 450}  # under the 30/min (demo) and 500/min (analyst) caps


class CoinGecko:
    def __init__(self, api_key: str | None = None, plan: str | None = None):
        self.plan = (plan or os.environ.get("COINGECKO_PLAN") or "demo").lower()
        if self.plan not in BASE:
            raise ValueError(f"COINGECKO_PLAN must be demo or pro, got {self.plan!r}")
        key = api_key or os.environ.get("COINGECKO_API_KEY")
        if not key:
            raise RuntimeError("COINGECKO_API_KEY is not set (see .env.example)")
        self._c = http.client(base_url=BASE[self.plan], headers={HEADER[self.plan]: key})
        self._interval = 60.0 / CALLS_PER_MIN[self.plan]
        self._next_slot = 0.0
        self._lock = threading.Lock()

    def _throttle(self) -> None:
        """Thread-safe: each call reserves the next free slot, so N workers share one rate."""
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next_slot)
            self._next_slot = slot + self._interval
        if slot > now:
            time.sleep(slot - now)

    def _get(self, path: str, params: dict | None = None):
        self._throttle()
        r = http.get(self._c, path, params=params)
        return None if r.status_code == 404 else r.json()

    def ping(self) -> dict:
        return self._get("/ping")

    def coins_list(self, status: str = "active") -> pd.DataFrame:
        """status='inactive' (Analyst+) returns delisted coins: needed to avoid survivorship bias."""
        return pd.DataFrame(self._get("/coins/list", {"status": status}))

    def coin_categories(self, coin_id: str) -> list[str]:
        body = self._get(
            f"/coins/{coin_id}",
            {
                "localization": "false",
                "tickers": "false",
                "market_data": "false",
                "community_data": "false",
                "developer_data": "false",
            },
        )
        return (body or {}).get("categories") or []

    def market_chart(self, coin_id: str, start: datetime, end: datetime) -> pd.DataFrame:
        """Daily price, market cap and volume in USD. Ranges over 90 days come back daily."""
        body = self._get(
            f"/coins/{coin_id}/market_chart/range",
            {"vs_currency": "usd", "from": int(start.timestamp()), "to": int(end.timestamp())},
        )
        return parse_market_chart(body or {})

    def fetch_history(self, coin_id: str, start: datetime | None = None) -> pd.DataFrame:
        start = start or datetime(2013, 4, 28, tzinfo=UTC)
        df = self.market_chart(coin_id, start, datetime.now(UTC))
        if df.empty:
            return df
        return cache.upsert(df, "coingecko_daily", coin_id)


def parse_market_chart(body: dict) -> pd.DataFrame:
    """CoinGecko returns three [ms, value] arrays of daily points stamped 00:00 UTC, plus a
    trailing intraday 'now' point.

    A point stamped D 00:00 is the close of day D-1, so we shift it back one day. That makes
    `date` mean "the close of this UTC day", matching Binance klines labelled by open day.
    The intraday point is dropped: it is not a close."""
    cols = {"prices": "price_usd", "market_caps": "market_cap_usd", "total_volumes": "volume_usd"}
    frames = []
    for src, dst in cols.items():
        pts = body.get(src) or []
        if not pts:
            continue
        s = pd.DataFrame(pts, columns=["ts", dst])
        ts = pd.to_datetime(s["ts"], unit="ms", utc=True).dt.tz_localize(None)
        s = s[ts == ts.dt.normalize()].copy()
        s["date"] = ts[s.index].dt.normalize() - pd.Timedelta(days=1)
        frames.append(s.drop(columns="ts").groupby("date").last())
    if not frames:
        return pd.DataFrame(columns=["date", *cols.values()])
    return pd.concat(frames, axis=1).reset_index()
