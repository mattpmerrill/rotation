import pandas as pd

from rotation.data.prices import build_panel, match_coinmetrics

DATES = pd.date_range("2019-01-01", periods=200)


def _series(key, name, prices):
    return pd.DataFrame({key: name, "date": DATES, "price_usd": prices})


def test_match_requires_price_agreement_not_just_symbol():
    cg = pd.concat(
        [
            _series("coin_id", "ripple", [0.5] * 200),
            _series("coin_id", "ripple-fake", [9.0] * 200),  # same symbol, different coin
        ]
    )
    cm = _series("asset", "xrp", [0.501] * 200)
    m = match_coinmetrics(cm, cg, {"ripple": "xrp", "ripple-fake": "xrp"})
    assert m == {"xrp": "ripple"}


def test_best_of_two_assets_wins():
    cg = _series("coin_id", "eos", [5.0] * 200)
    cm = pd.concat(
        [_series("asset", "eos", [5.01] * 200), _series("asset", "eos_eth", [5.06] * 200)]
    )
    assert match_coinmetrics(cm, cg, {"eos": "eos"}) == {"eos": "eos"}


def test_panel_prefers_coinmetrics_and_falls_back_to_coingecko():
    cg = pd.DataFrame(
        {
            "coin_id": "bitcoin",
            "date": pd.to_datetime(["2017-09-13", "2017-09-14"]),
            "price_usd": [3100.0, 3588.0],
        }
    )
    cm = pd.DataFrame(
        {"asset": "btc", "date": pd.to_datetime(["2017-09-13"]), "price_usd": [3887.0]}
    )
    p = build_panel(cg, cm, {"btc": "bitcoin"}).set_index("date")
    assert (
        p.loc["2017-09-13", "price_usd"] == 3887.0
        and p.loc["2017-09-13", "source"] == "coinmetrics"
    )
    assert p.loc["2017-09-14", "source"] == "coingecko"


def test_coinmetrics_overrides_alts_only_before_2019_but_btc_always():
    dates = pd.to_datetime(["2018-06-01", "2020-06-01"])
    cg = pd.concat(
        [
            pd.DataFrame({"coin_id": "qtum", "date": dates, "price_usd": [10.0, 3.0]}),
            pd.DataFrame({"coin_id": "bitcoin", "date": dates, "price_usd": [7000.0, 9500.0]}),
        ]
    )
    cm = pd.concat(
        [
            pd.DataFrame({"asset": "qtum_eth", "date": dates, "price_usd": [11.0, 0.01]}),  # stale
            pd.DataFrame({"asset": "btc", "date": dates, "price_usd": [7100.0, 9510.0]}),
        ]
    )
    p = build_panel(cg, cm, {"qtum_eth": "qtum", "btc": "bitcoin"}).set_index(["coin_id", "date"])
    assert p.loc[("qtum", "2018-06-01"), "price_usd"] == 11.0
    assert p.loc[("qtum", "2020-06-01"), "price_usd"] == 3.0
    assert p.loc[("bitcoin", "2020-06-01"), "price_usd"] == 9510.0
