"""BTC cycle inputs shared by the challenge research (buy_timing, challenge_exits): the halving
dates, the folder the reports are written to, and BTC's cycle features from the cache."""

from __future__ import annotations

import pandas as pd

from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.cycle import cycle_features

HALVINGS = [pd.Timestamp(d) for d in get_config().rules.cycle.halvings]
REPORT_DIR = REPO_ROOT / "docs" / "backtests"


def load_features() -> pd.DataFrame:
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    return cycle_features(btc, mvrv, HALVINGS, get_config().rules.cycle.sell.trend_weekly_sma)
