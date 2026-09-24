import pandas as pd

from rotation.data.derivs import agrees, candidate_coins, parse_symbol


def test_parse_symbol_multipliers():
    assert parse_symbol("BTCUSDT") == ("BTC", 1)
    assert parse_symbol("1000PEPEUSDT") == ("PEPE", 1000)
    assert parse_symbol("1000000MOGUSDT") == ("MOG", 1_000_000)
    assert parse_symbol("1MBABYDOGEUSDT") == ("BABYDOGE", 1_000_000)
    assert parse_symbol("ADABUSD") is None
    assert parse_symbol("1INCHUSDT") == ("1INCH", 1)  # a leading digit is not a multiplier


def test_candidate_coins_tries_version_suffix():
    by_symbol = {"luna": ["terra-luna-2"], "luna2": []}
    assert candidate_coins("LUNA2", by_symbol) == ["terra-luna-2"]


def test_agrees_applies_multiplier():
    dates = pd.date_range("2024-01-01", periods=20)
    panel = pd.Series(0.000001, index=dates)
    fut = pd.DataFrame({"date": dates, "close": 0.001})  # per 1000 tokens
    assert agrees(fut, panel, 1000)
    assert not agrees(fut, panel, 1)


def test_overlap_walks_in_past_short_listing_month():
    from rotation.data.derivs import _overlap

    panel = pd.Series(1.0, index=pd.date_range("2020-01-31", "2020-03-31"))
    months = {
        "2020-01": pd.DataFrame({"date": pd.to_datetime(["2020-01-31"]), "close": [1.0]}),
        "2020-02": pd.DataFrame({"date": pd.date_range("2020-02-01", "2020-02-29"), "close": 1.0}),
    }
    got = _overlap(["2020-01", "2020-02"], months.get, panel, from_end=False)
    assert got is not None and len(got) == 30


def test_overlap_gives_up_without_enough_shared_days():
    from rotation.data.derivs import _overlap

    panel = pd.Series(1.0, index=pd.date_range("2019-01-01", periods=5))
    months = {
        "2024-01": pd.DataFrame({"date": pd.date_range("2024-01-01", periods=31), "close": 1.0})
    }
    assert _overlap(["2024-01"], months.get, panel, from_end=True) is None
