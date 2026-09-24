import pandas as pd

from rotation.config import Ranking, load_config
from rotation.data.universe import drop_spikes, eligible, ever_in_top, is_excluded, rank_by_day

# Tests of ordering use a permissive ranking config; eligibility has its own tests.
OPEN = Ranking(volume_window_days=1, min_volume_days=0, min_turnover=0.0)


def _frame(rows):
    df = pd.DataFrame(rows, columns=["coin_id", "date", "market_cap_usd", "volume_usd"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def _days(coin, caps, vols=None, start="2021-01-01"):
    dates = pd.date_range(start, periods=len(caps))
    vols = vols or [c * 0.05 for c in caps]
    return [(coin, d, c, v) for d, c, v in zip(dates, caps, vols, strict=True)]


def test_rank_by_day_orders_by_market_cap():
    df = _frame(
        [("a", "2021-01-01", 10.0, 1), ("b", "2021-01-01", 30.0, 1), ("c", "2021-01-01", 20.0, 1)]
    )
    r = rank_by_day(df, ranking=OPEN)
    assert list(r.sort_values("rank")["coin_id"]) == ["b", "c", "a"]


def test_rank_excludes_before_ranking():
    df = _frame([("tether", "2021-01-01", 99.0, 1), ("a", "2021-01-01", 1.0, 1)])
    r = rank_by_day(df, exclude={"tether"}, ranking=OPEN)
    assert r.loc[r.coin_id == "a", "rank"].item() == 1


def test_rank_ignores_zero_market_cap():
    df = _frame([("a", "2021-01-01", 0.0, 1), ("b", "2021-01-01", 1.0, 1)])
    assert set(rank_by_day(df, ranking=OPEN)["coin_id"]) == {"b"}


def test_one_day_spike_is_dropped_but_real_trend_is_kept():
    spiky = [1.0] * 5 + [50.0] + [1.0] * 5
    trending = [float(2**i) for i in range(11)]
    df = _frame(_days("spiky", spiky) + _days("trend", trending))
    out = drop_spikes(df)
    assert 50.0 not in set(out.loc[out.coin_id == "spiky", "market_cap_usd"])
    assert len(out[out.coin_id == "trend"]) == len(trending)


def test_impossible_cap_on_dead_market_is_not_rankable():
    # the real case: $2.9e21 market cap on ~$563/day of volume
    junk = _days("junk", [2.9e21] * 40, vols=[563.0] * 40)
    real = _days("real", [5e9] * 40, vols=[2e8] * 40)
    df = _frame(junk + real)
    ok = eligible(df)
    assert not ok[df.coin_id == "junk"].any()
    assert ok[df.coin_id == "real"].iloc[-1]


def test_new_coin_needs_volume_history_before_ranking():
    df = _frame(_days("new", [1e9] * 25, vols=[1e8] * 25))
    ok = eligible(df, window=30, min_days=20)
    assert not ok.iloc[18] and ok.iloc[19]


def test_ever_in_top():
    df = _frame(
        [("a", "2021-01-01", 3.0, 1), ("b", "2021-01-01", 2.0, 1), ("c", "2021-01-01", 1.0, 1)]
    )
    assert ever_in_top(rank_by_day(df, ranking=OPEN), 2) == {"a", "b"}


def test_exclusions_use_exact_category_names():
    u = load_config().universe
    cats, ids = u.exclude_categories, u.exclude_ids
    assert is_excluded("x", ["Stablecoins", "Ethereum Ecosystem"], cats, ids)
    assert is_excluded("x", ["Wrapped-Tokens"], cats, ids)
    assert is_excluded("x", ["Liquid Staking Tokens"], cats, ids)
    assert is_excluded("x", ["Tokenized Gold"], cats, ids)
    assert is_excluded("x", ["Compound Tokens"], cats, ids)
    assert is_excluded("x", ["Liquid Staked HYPE\t"], cats, ids)  # CoinGecko has a stray tab
    assert is_excluded("tether", [], cats, ids)


def test_real_alts_are_not_excluded():
    """Regression: keyword matching excluded these via 'Stablecoin Issuer' / 'Liquid Staking'."""
    u = load_config().universe
    cats, ids = u.exclude_categories, u.exclude_ids
    assert not is_excluded("aave", ["Decentralized Finance (DeFi)", "Stablecoin Issuer"], cats, ids)
    assert not is_excluded(
        "lido-dao", ["Liquid Staking Governance Tokens", "Liquid Staking"], cats, ids
    )
    assert not is_excluded("solana", ["Smart Contract Platform", "Layer 1 (L1)"], cats, ids)


def test_force_include_beats_category_but_not_exclude_ids():
    u = load_config().universe
    cats = u.exclude_categories
    assert not is_excluded("ethlend", ["Aave Tokens"], cats, [], ["ethlend"])
    assert is_excluded("tether", [], cats, ["tether"], ["tether"])


def test_peg_detector_catches_uncategorised_stable_not_a_quiet_alt():
    from rotation.data.universe import pegged_coins

    peg = load_config().universe.peg_detector
    n = 120
    dates = pd.date_range("2026-01-01", periods=n)
    stable = pd.DataFrame(
        {"coin_id": "royal", "date": dates, "price_usd": [1.0, 1.0005] * (n // 2)}
    )
    quiet_alt = pd.DataFrame({"coin_id": "leo", "date": dates, "price_usd": [8.0, 8.01] * (n // 2)})
    trending = pd.DataFrame(
        {"coin_id": "alt", "date": dates, "price_usd": [0.95 * 1.01**i for i in range(n)]}
    )
    assert pegged_coins(pd.concat([stable, quiet_alt, trending]), peg) == {"royal"}
