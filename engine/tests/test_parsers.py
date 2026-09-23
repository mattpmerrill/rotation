"""Parser tests use byte fixtures copied from real archive files (2017, 2024, 2025 formats)."""

import pandas as pd

from rotation.data import binance_archive as ba
from rotation.data import coingecko, coinmetrics

SPOT_2017_MS = (
    b"1504224000000,4689.89000000,4885.55000000,4654.88000000,4834.91000000,560.66636600,"
    b"1504310399999,2665165.55924616,4000,118.66010300,566254.43089734,10906.14445652\n"
)
SPOT_2025_US = (
    b"1740787200000000,84349.95000000,86558.00000000,83824.78000000,86064.53000000,"
    b"25785.05464000,1740873599999999,2194003507.85264280,3700728,11748.10769000,"
    b"1000093822.53835250,0\n"
)


def test_klines_millisecond_timestamps():
    df = ba.parse_klines(SPOT_2017_MS)
    assert df.loc[0, "date"] == pd.Timestamp("2017-09-01")
    assert df.loc[0, "close"] == 4834.91


def test_klines_microsecond_timestamps():
    df = ba.parse_klines(SPOT_2025_US)
    assert df.loc[0, "date"] == pd.Timestamp("2025-03-01")
    assert df.loc[0, "quote_volume"] > 2e9


def test_klines_with_header_row():
    header = (",".join(ba.KLINE_COLS) + "\n").encode()
    assert len(ba.parse_klines(header + SPOT_2017_MS)) == 1


def test_funding_daily_mean_and_4h_normalisation():
    raw = (
        b"calc_time,funding_interval_hours,last_funding_rate\n"
        b"1709251200000,8,0.0004\n"
        b"1709280000000,8,0.0002\n"
        b"1709294400000,4,0.0001\n"  # 4h interval: 0.0001 per 4h == 0.0002 per 8h
    )
    df = ba.parse_funding(raw)
    assert len(df) == 1
    assert abs(df.loc[0, "funding_8h"] - (0.0004 + 0.0002 + 0.0002) / 3) < 1e-12
    assert df.loc[0, "events"] == 3


def test_metrics_keeps_last_snapshot_of_day():
    raw = (
        b"create_time,symbol,sum_open_interest,sum_open_interest_value,a,b,c,d\n"
        b"2024-03-01 23:55:00,BTCUSDT,2,200,1,1,1,1\n"
        b"2024-03-01 00:00:00,BTCUSDT,1,100,1,1,1,1\n"
    )
    df = ba.parse_metrics(raw)
    assert len(df) == 1 and df.loc[0, "oi_usd"] == 200


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
