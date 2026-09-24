"""The five Phase 0 questions, plus the open Vault-rebalance question.

Every variant differs from the rules as written in exactly one switch, and every
result is measured in BTC (net of the tax reserve, which is treated as owed).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from rotation.backtest.benchmarks import alt_index
from rotation.backtest.sim import Options, Result, run
from rotation.config import Rules

FULL = ("2019-01-01", "2026-09-22")
RUNS = {"2020-21 run": ("2020-03-15", "2021-11-10"), "2023-25 run": ("2023-01-01", "2025-10-06")}
TOPS = {
    "2017": "2017-12-17",
    "2021 (Apr)": "2021-04-14",
    "2021 (Nov)": "2021-11-10",
    "2025": "2025-10-06",
}
MISSING_SHARE = 0.10  # a flag counts as "missing data" if blank on >10% of the window


@dataclass
class Variant:
    name: str
    rules: Rules
    opts: Options


def with_rules(r: Rules, **section_updates) -> Rules:
    """with_rules(r, score={"half_size_at": 4}) -> a copy with one section changed."""
    upd = {k: getattr(r, k).model_copy(update=v) for k, v in section_updates.items()}
    return r.model_copy(update=upd)


def metrics(res: Result) -> dict:
    e = res.equity
    tr = res.trades
    net = e["net_btc"]
    btc = e["btc_close"]
    cost_btc = 0.0
    if len(tr):
        px = tr["date"].map(btc)
        cost_btc = (tr["usd"].abs() / px).fillna(0).sum() * 0.004
    alt = tr[~tr["coin_id"].isin(["bitcoin", ""])] if len(tr) else tr
    return {
        "btc_multiple": net.iloc[-1] / net.iloc[0],
        "usd_multiple": e["value_usd"].iloc[-1] / e["value_usd"].iloc[0],
        "max_dd_usd": (1 - e["value_usd"] / e["value_usd"].cummax()).max(),
        "max_dd_btc": (1 - net / net.cummax()).max(),
        "alt_entries": int((alt["side"] == "buy").sum()) if len(alt) else 0,
        "fees_btc_equiv": cost_btc,
        "avg_alt_weight": (e["alts_usd"] / e["value_usd"]).mean(),
        "end_btc": net.iloc[-1],
        "start_btc": net.iloc[0],
        "sleeve_end_btc": e["sleeve_value_btc"].iloc[-1],
        "sleeve_max_dd_btc": (1 - e["sleeve_value_btc"] / e["sleeve_value_btc"].cummax()).max(),
    }


def compare(variants: list[Variant], feats, mkt, start: str, end: str) -> tuple[pd.DataFrame, dict]:
    rows, runs = [], {}
    for v in variants:
        res = run(v.rules, feats, mkt, start, end, v.opts)
        runs[v.name] = res
        rows.append({"variant": v.name, **metrics(res)})
    return pd.DataFrame(rows).set_index("variant"), runs


def benchmarks(ranks, prices, btc, start, end, cost) -> dict:
    alts = prices[prices["coin_id"] != "bitcoin"]
    return {
        "HODL BTC": 1.0 - cost,
        "Top-20 alts (equal weight)": alt_index(ranks, alts, btc, start, end, 20, cost).iloc[-1],
        "Top-100 alts (equal weight)": alt_index(ranks, alts, btc, start, end, 100, cost).iloc[-1],
    }


# --- the questions --------------------------------------------------------------


def q1_ladder_vs_hold(r, feats, mkt):
    out = {}
    for label, (a, b) in RUNS.items():
        out[label] = compare(
            [
                Variant("Ladder (rules)", r, Options()),
                Variant("Hold (no profit-taking)", r, Options(take_profits=False)),
            ],
            feats,
            mkt,
            a,
            b,
        )
    return out


def q2_altbtc_gate(r, feats, mkt):
    return compare(
        [
            Variant("With ALT/BTC gate (rules)", r, Options()),
            Variant("Without ALT/BTC gate", r, Options(use_altbtc_gate=False)),
        ],
        feats,
        mkt,
        *FULL,
    )


def q3_regime_switch(r, feats, mkt):
    return compare(
        [
            Variant("Regime switch (rules)", r, Options()),
            Variant("Always Expand", r, Options(regime_override="expand")),
            Variant("Always Accumulate", r, Options(regime_override="accumulate")),
        ],
        feats,
        mkt,
        *FULL,
    )


def q5_score_threshold(r, feats, mkt):
    return compare(
        [
            Variant("Enter at 3+ (rules)", r, Options()),
            Variant("Enter at 4+ only", with_rules(r, score={"half_size_at": 4}), Options()),
        ],
        feats,
        mkt,
        *FULL,
    )


def no_core_sales(r: Rules) -> Rules:
    """The same rules with the cycle-top exit switched off for the core (alts still sold)."""
    tiers = [t.model_copy(update={"vault_to_stables": 0.0}) for t in r.euphoria_actions.tiers]
    return with_rules(r, euphoria_actions={"tiers": tiers})


def designs(r: Rules) -> list[Variant]:
    """Whole-portfolio designs, all starting from the same BTC."""
    usd = {"mode": "usd_buckets"}
    return [
        Variant("Your plan: BTC core + 10% alt sleeve", r, Options()),
        Variant(
            "Core only, with the cycle-top exit (no alts)",
            with_rules(r, portfolio={"sleeve_frac": 0.0}),
            Options(),
        ),
        Variant(
            "Just hold the BTC",
            with_rules(no_core_sales(r), portfolio={"sleeve_frac": 0.0}),
            Options(),
        ),
        Variant(
            "Program doc as written: USD buckets, two-way",
            with_rules(r, portfolio=usd, rebalance={"vault": "two_way"}),
            Options(),
        ),
        Variant(
            "Program doc: USD buckets, Vault top-up only",
            with_rules(r, portfolio=usd, rebalance={"vault": "top_up_only"}),
            Options(),
        ),
    ]


def portfolio_designs(r, feats, mkt, start: str = FULL[0], end: str = FULL[1]):
    return compare(designs(r), feats, mkt, start, end)


def q4_top_exits(signals: pd.DataFrame, flags_df: pd.DataFrame) -> pd.DataFrame:
    """For each cycle top: when each euphoria tier (and the backstop) first fired within
    a year before/after, and where BTC was vs its ATH at that moment."""
    rows = []
    btc = signals["btc_close"]
    for label, top in TOPS.items():
        t = pd.Timestamp(top)
        win = signals.loc[t - pd.Timedelta(days=365) : t + pd.Timedelta(days=365)]
        ath_date = btc.loc[t - pd.Timedelta(days=60) : t + pd.Timedelta(days=60)].idxmax()
        ath = btc.loc[ath_date]
        row = {
            "cycle": label,
            "btc_top_date": ath_date.date(),
            "btc_top_usd": ath,
            "max_flags": int(win["flag_count"].max()),
        }
        for tier in (1, 2, 3):
            hit = win.index[win["tier"] >= tier]
            row[f"tier{tier}_date"] = hit[0].date() if len(hit) else None
            row[f"tier{tier}_vs_top"] = btc.loc[hit[0]] / ath - 1 if len(hit) else None
            row[f"tier{tier}_days_from_top"] = (hit[0] - ath_date).days if len(hit) else None
        bs = win.index[win["backstop"]]
        row["backstop_date"] = bs[0].date() if len(bs) else None
        row["backstop_vs_top"] = btc.loc[bs[0]] / ath - 1 if len(bs) else None
        unknown = flags_df.loc[win.index, "flags_unknown"]
        counts: dict[str, int] = {}
        for u in unknown:
            for x in filter(None, u.split(";")):
                counts[x] = counts.get(x, 0) + 1
        row["flags_missing_data"] = ";".join(
            sorted(k for k, n in counts.items() if n > MISSING_SHARE * len(win))
        )
        rows.append(row)
    return pd.DataFrame(rows).set_index("cycle")


# --- walk-forward -----------------------------------------------------------------


def walk_forward(
    variants: list[Variant], feats, mkt, start: str, end: str, train_days: int, test_days: int
) -> pd.DataFrame:
    """Each window: pick the variant with the better BTC multiple on the previous
    `train_days`, then score it on the next `test_days`. Compares that chooser with
    always using each variant, chained over all test windows."""
    t0 = pd.Timestamp(start) + pd.Timedelta(days=train_days)
    rows = []
    while t0 + pd.Timedelta(days=test_days) <= pd.Timestamp(end):
        tr_a, tr_b = t0 - pd.Timedelta(days=train_days), t0 - pd.Timedelta(days=1)
        te_b = t0 + pd.Timedelta(days=test_days - 1)
        train = {
            v.name: metrics(run(v.rules, feats, mkt, str(tr_a.date()), str(tr_b.date()), v.opts))[
                "btc_multiple"
            ]
            for v in variants
        }
        test = {
            v.name: metrics(run(v.rules, feats, mkt, str(t0.date()), str(te_b.date()), v.opts))[
                "btc_multiple"
            ]
            for v in variants
        }
        pick = max(train, key=train.get)
        rows.append({"test_start": t0.date(), "picked": pick, "chooser": test[pick], **test})
        t0 += pd.Timedelta(days=test_days)
    return pd.DataFrame(rows)
