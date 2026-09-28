"""BTC's cycle features from live data, for the daily job."""

from __future__ import annotations

import pandas as pd

from rotation.config import Cycle
from rotation.data import coinmetrics, http
from rotation.rules.cycle import cycle_features


def live_features(c: Cycle) -> pd.DataFrame:
    """Fresh BTC price + MVRV from CoinMetrics (free, no key) -> cycle features."""
    with http.client() as client:
        px = coinmetrics.fetch_prices(client, ["btc"], start="2010-07-18")
        onchain = coinmetrics.fetch_btc_onchain(client)
    btc = px.set_index("date")["price_usd"].sort_index()
    mvrv = onchain.set_index("date")["mvrv"]
    halvings = [pd.Timestamp(h) for h in c.halvings]
    return cycle_features(btc, mvrv, halvings, c.sell.trend_weekly_sma)
