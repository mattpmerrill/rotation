"""Parser tests use fixtures shaped like real CoinGecko and CoinMetrics responses."""

import pandas as pd

from rotation.data import coingecko, coinmetrics


def test_coingecko_shifts_to_close_of_day_and_drops_intraday_point():
    day = 86_400_000
    t0 = 1709251200000  # 2024-03-01 00:00 UTC
    body = {
        "prices": [[t0, 10.0], [t0 + day, 11.0], [t0 + day + 3_600_000, 99.0]],
        "market_caps": [[t0, 100.0], [t0 + day, 110.0], [t0 + day + 3_600_000, 999.0]],
        "total_volumes": [[t0, 5.0], [t0 + day, 6.0], [t0 + day + 3_600_000, 9.0]],
    }
    df = coingecko.parse_market_chart(body)
    assert list(df["date"]) == [pd.Timestamp("2024-02-29"), pd.Timestamp("2024-03-01")]
    assert list(df["price_usd"]) == [10.0, 11.0]


def test_coinmetrics_realized_cap():
    rows = [{"time": "2017-12-17T00:00:00.000000000Z", "CapMrktCurUSD": "300", "CapMVRVCur": "4"}]
    df = coinmetrics.parse(rows)
    assert df.loc[0, "realized_cap_usd"] == 75
