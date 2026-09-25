"""Data for the Strategy Explorer page: every strategy, per cycle, from 1 BTC at the halving.

Writes docs/backtests/strategy-explorer.json (weekly series + the full alt grid).
"""

from __future__ import annotations

import json
from dataclasses import replace

import numpy as np
import pandas as pd

from rotation.backtest.alt_harvest import MATT_BASKET, AltRules, grid, simulate
from rotation.backtest.cycle_sim import run_cycle
from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.cycle import buy_started, cycle_features, rules_from_config

OUT = REPO_ROOT / "docs" / "backtests" / "strategy-explorer.json"

ALT_VARIANTS = {
    "alt_never": ("Alts, never sell until the top", AltRules(1.0, 0.0, 0.10, "usd")),
    "alt_25usd": ("Alts, sell 25% at +25% (USD)", AltRules(0.25, 0.25, 0.10, "usd")),
    "alt_100btc": ("Alts, sell 10% at +100% vs BTC", AltRules(1.0, 0.10, 0.10, "btc")),
}


def build() -> dict:
    c = get_config().rules.cycle
    sell3, buy = rules_from_config(c)
    sell2 = replace(sell3, target_frac=0.5)
    fee = c.account.fee_per_trade
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    halvings = [pd.Timestamp(h) for h in c.halvings]
    cf = cycle_features(btc, mvrv, halvings, c.sell.trend_weekly_sma)
    alt = px[px["coin_id"] != "bitcoin"].pivot(index="date", columns="coin_id", values="price_usd")
    ranks = cache.read("universe", "ranks")
    cycles = {
        "2016": (halvings[1], halvings[2] - pd.Timedelta(days=1)),
        "2020": (halvings[2], halvings[3] - pd.Timedelta(days=1)),
        "2024": (halvings[3], btc.index[-1]),
    }
    coins = {}
    for k, (s, _) in cycles.items():
        top5 = ranks[(ranks["date"] == s) & (ranks["rank"] <= 5)].sort_values("rank")["coin_id"]
        yours = [
            x for x in MATT_BASKET if x in alt.columns and not np.isnan(alt.loc[s].get(x, np.nan))
        ]
        coins[k] = {"top5": list(top5), "yours": yours}

    def weekly(series: pd.Series) -> list:
        w = series.resample("W-SUN").last().dropna()
        return [[d.strftime("%Y-%m-%d"), round(float(v), 4)] for d, v in w.items()]

    out = {
        "generated": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d"),
        "fee": fee,
        "window": [sell3.window_start_days, sell3.window_end_days],
        "cycles": {},
    }
    for k, (s, e) in cycles.items():
        entry = {
            "start": s.strftime("%Y-%m-%d"),
            "end": e.strftime("%Y-%m-%d"),
            "complete": k != "2024",
            "coins": coins[k],
            "series": {},
            "btc_price": weekly(btc.loc[s:e]),
        }
        entry["series"]["hold"] = weekly(pd.Series(1.0, index=btc.loc[s:e].index))
        for key, sell in (("harvest_third", sell3), ("harvest_half", sell2)):
            d = run_cycle(
                cf.loc[:e],
                sell,
                buy,
                start_btc=1.0,
                fee=fee,
                tax_rate=0.0,
                start=s.strftime("%Y-%m-%d"),
            ).daily
            entry["series"][key] = weekly(d["btc_equiv"])
        for basket in ("top5", "yours"):
            for key, (_, a) in ALT_VARIANTS.items():
                d = simulate(cf, alt, coins[k][basket], s, e, replace(a), sell2, buy, fee)
                entry["series"][f"{key}_{basket}"] = weekly(d["btc_equiv"])
        out["cycles"][k] = entry
    g = grid(
        cf,
        alt,
        {k: {"top5": v["top5"], "yours": v["yours"]} for k, v in coins.items()},
        sell2,
        buy,
        fee,
        cycles,
    )
    out["grid"] = g.round(4).to_dict(orient="records")
    out["entry"] = entry_timing(cf, alt, ranks, btc, halvings, sell2, buy, fee)
    out["labels"] = {k: v[0] for k, v in ALT_VARIANTS.items()}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    return out


NEVER = AltRules(1.0, 0.0, 0.10, "usd")


def _top5(ranks: pd.DataFrame, day: pd.Timestamp) -> list[str]:
    return list(ranks[(ranks["date"] == day) & (ranks["rank"] <= 5)].sort_values("rank")["coin_id"])


def entry_timing(cf, alt, ranks, btc, halvings, sell, buy, fee) -> dict:
    """When to buy the alt basket: (1) single entries from a year before to a year after
    each halving, (2) four slices over halving..+180 days, (3) the "start now" replay:
    the same number of days after each past top as today."""
    ends = [halvings[2], halvings[3], btc.index[-1]]
    offsets, stagger = [], []
    for h, end in zip(halvings[1:], ends, strict=True):
        w = h + pd.Timedelta(days=sell.window_start_days - 1)
        for off in (-365, -180, -90, 0, 90, 180, 270, 365):
            s = h + pd.Timedelta(days=off)
            coins = _top5(ranks, s)
            if s < pd.Timestamp("2016-02-01") or not coins:  # rankings need 20 days of history
                continue
            d = simulate(cf, alt, coins, s, end, NEVER, sell, buy, fee)
            offsets.append(
                {
                    "halving": h.year,
                    "offset": off,
                    "at_window": round(d.loc[:w, "btc_equiv"].iloc[-1], 4),
                }
            )
        parts, finals = [], []
        for off in (0, 60, 120, 180):
            s = h + pd.Timedelta(days=off)
            d = simulate(cf, alt, _top5(ranks, s), s, end, NEVER, sell, buy, fee)
            parts.append(d["btc_equiv"])
            finals.append(d["btc_equiv"].iloc[-1])
        idx = parts[0].index
        comb = sum(p.reindex(idx).fillna(1.0) for p in parts) / 4
        stagger.append(
            {
                "halving": h.year,
                "at_window": round(comb.loc[:w].iloc[-1], 4),
                "worst": round(comb.loc[:w].min(), 4),
                "end": round(sum(finals) / 4, 4),
            }
        )

    today_dsa = int(cf["days_since_ath"].iloc[-1])
    replay = []
    for top, h, end in (
        (pd.Timestamp("2017-12-16"), halvings[2], halvings[3]),
        (pd.Timestamp("2021-11-08"), halvings[3], btc.index[-1]),
    ):
        w = h + pd.Timedelta(days=sell.window_start_days - 1)
        after = cf.loc[top : top + pd.Timedelta(days=700)]
        starts = {
            "Same point as today": top + pd.Timedelta(days=today_dsa),
            "Buy signal fires": after[after.apply(lambda r: buy_started(r, buy), axis=1)].index[0],
            "Bear bottom (hindsight)": btc.loc[top : top + pd.Timedelta(days=600)].idxmin(),
            "Halving": h,
        }
        for name, s in starts.items():
            s = pd.Timestamp(s)
            d = simulate(cf, alt, _top5(ranks, s), s, end, NEVER, sell, buy, fee)
            replay.append(
                {
                    "cycle": f"{top.year + 1}-{str(w.year)[-2:]}",
                    "start": name,
                    "date": s.strftime("%Y-%m-%d"),
                    "coins": _top5(ranks, s),
                    "at_window": round(d.loc[:w, "btc_equiv"].iloc[-1], 4),
                    "worst": round(d.loc[:w, "btc_equiv"].min(), 4),
                }
            )
    return {
        "offsets": offsets,
        "stagger": stagger,
        "replay": replay,
        "today_days_since_ath": today_dsa,
    }
