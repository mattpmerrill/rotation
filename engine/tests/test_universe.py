import pandas as pd

from rotation.config import load_config
from rotation.data.universe import drop_spikes, ever_in_top, is_excluded, rank_by_day


def _frame(rows):
    df = pd.DataFrame(rows, columns=["coin_id", "date", "market_cap_usd"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def _days(coin, caps, start="2021-01-01"):
    dates = pd.date_range(start, periods=len(caps))
    return [(coin, d, c) for d, c in zip(dates, caps, strict=True)]


def test_rank_by_day_orders_by_market_cap():
    df = _frame([("a", "2021-01-01", 10.0), ("b", "2021-01-01", 30.0), ("c", "2021-01-01", 20.0)])
    r = rank_by_day(df)
    assert list(r.sort_values("rank")["coin_id"]) == ["b", "c", "a"]


def test_rank_excludes_before_ranking():
    df = _frame([("tether", "2021-01-01", 99.0), ("a", "2021-01-01", 1.0)])
    r = rank_by_day(df, exclude={"tether"})
    assert r.loc[r.coin_id == "a", "rank"].item() == 1


def test_rank_ignores_zero_market_cap():
    df = _frame([("a", "2021-01-01", 0.0), ("b", "2021-01-01", 1.0)])
    assert set(rank_by_day(df)["coin_id"]) == {"b"}


def test_one_day_spike_is_dropped_but_real_trend_is_kept():
    spiky = [1.0] * 5 + [50.0] + [1.0] * 5
    trending = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]
    df = _frame(_days("spiky", spiky) + _days("trend", [float(x) for x in trending]))
    out = drop_spikes(df)
    assert 50.0 not in set(out.loc[out.coin_id == "spiky", "market_cap_usd"])
    assert len(out[out.coin_id == "trend"]) == len(trending)


def test_ever_in_top():
    df = _frame([("a", "2021-01-01", 3.0), ("b", "2021-01-01", 2.0), ("c", "2021-01-01", 1.0)])
    assert ever_in_top(rank_by_day(df), 2) == {"a", "b"}


def test_exclusion_keywords_from_config():
    u = load_config().universe
    kw, ids = u.exclude_category_keywords, u.exclude_ids
    assert is_excluded("x", ["Stablecoins", "Ethereum Ecosystem"], kw, ids)
    assert is_excluded("x", ["Wrapped-Tokens"], kw, ids)
    assert is_excluded("x", ["Liquid Staking Tokens"], kw, ids)
    assert is_excluded("x", ["Tokenized Gold"], kw, ids)
    assert is_excluded("tether", [], kw, ids)
    assert not is_excluded("solana", ["Smart Contract Platform", "Layer 1 (L1)"], kw, ids)
