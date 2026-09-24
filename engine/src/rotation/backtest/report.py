"""Run every Phase 0 experiment and write docs/backtests/phase0-report.md + charts.

The findings text is built from the numbers at run time, so the report never disagrees
with its own tables. Everything is measured in BTC, net of the tax reserve.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from rotation.backtest import experiments as X
from rotation.backtest.benchmarks import alt_index
from rotation.backtest.features import build_features
from rotation.backtest.sim import Options, market_signals
from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.market import flags

OUT = REPO_ROOT / "docs" / "backtests"
IMG = OUT / "img"

# Reference palette, light mode. Validated with the dataviz validator (3 slots pass);
# aqua is < 3:1 on the surface, so every chart is direct-labelled with a table beside it.
S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e6e5e0", "#fcfcfb"


def _style(ax, title: str, ylabel: str) -> None:
    ax.set_facecolor(SURFACE)
    ax.figure.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", color=INK, fontsize=12, fontweight="bold", pad=12)
    ax.set_ylabel(ylabel, color=INK2, fontsize=10)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.grid(axis="x", visible=False)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)


def _lines(
    path: Path, title: str, ylabel: str, series, fmt="{:.2f}", log=False, legend="upper left"
) -> None:
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    for name, s, color in series:
        ax.plot(s.index, s.values, color=color, linewidth=2, label=name)
        ax.plot(
            s.index[-1],
            s.iloc[-1],
            "o",
            color=color,
            markersize=5,
            markeredgecolor=SURFACE,
            markeredgewidth=2,
        )
        ax.annotate(
            f"{name}  {fmt.format(s.iloc[-1])}",
            (s.index[-1], s.iloc[-1]),
            xytext=(8, 0),
            textcoords="offset points",
            va="center",
            fontsize=9,
            color=INK,
        )
    if log:
        ax.set_yscale("log")
    _style(ax, title, ylabel)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK, loc=legend)
    fig.subplots_adjust(right=0.74)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def _table(df: pd.DataFrame, start_btc: float) -> str:
    d = pd.DataFrame(index=df.index)
    d[f"{start_btc:g} BTC became"] = (df["btc_multiple"] * start_btc).map(lambda x: f"{x:.2f} BTC")
    d["vs start"] = (df["btc_multiple"] - 1).map(lambda x: f"{x:+.0%}")
    d["USD multiple"] = df["usd_multiple"].map(lambda x: f"{x:.1f}x")
    if df["sleeve_end_btc"].notna().any():
        d["Sleeve at end"] = df["sleeve_end_btc"].map(
            lambda x: "" if pd.isna(x) else f"{x:.2f} BTC"
        )
        d["Sleeve worst drop"] = df["sleeve_max_dd_btc"].map(
            lambda x: "" if pd.isna(x) else f"{x:.0%}"
        )
    d["Worst drop (BTC)"] = df["max_dd_btc"].map(lambda x: f"{x:.0%}")
    d["Worst drop (USD)"] = df["max_dd_usd"].map(lambda x: f"{x:.0%}")
    d["Alt buys"] = df["alt_entries"]
    d["Fees (BTC)"] = df["fees_btc_equiv"].map(lambda x: f"{x:.2f}")
    return d.to_markdown()


def build() -> Path:
    cfg = get_config()
    r = cfg.rules
    start_btc = r.portfolio.initial_btc
    IMG.mkdir(parents=True, exist_ok=True)
    feats = build_features(cfg)
    market = cache.read("universe", "market").set_index("date")
    mkt = market_signals(r, market)
    fl = flags(market, r.flags)
    ranks = cache.read("universe", "ranks")
    prices = cache.read("universe", "prices")
    btc = prices[prices["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    cost = r.backtest.fee_per_side + r.backtest.slippage_per_side
    oi = cache.read("universe", "open_interest")

    # --- run everything --------------------------------------------------------------
    full, full_runs = X.portfolio_designs(r, feats, mkt)
    runs = {k: X.portfolio_designs(r, feats, mkt, a, b) for k, (a, b) in X.RUNS.items()}
    alts_bench = {
        k: {
            n: alt_index(ranks, prices[prices.coin_id != "bitcoin"], btc, a, b, n, cost).iloc[-1]
            for n in (20, 100)
        }
        for k, (a, b) in {"2019-26": X.FULL, **X.RUNS}.items()
    }
    q1 = X.q1_ladder_vs_hold(r, feats, mkt)
    q2, _ = X.q2_altbtc_gate(r, feats, mkt)
    q3, q3_runs = X.q3_regime_switch(r, feats, mkt)
    q4 = X.q4_top_exits(mkt, fl)
    q5, _ = X.q5_score_threshold(r, feats, mkt)
    wf = X.walk_forward(
        [
            X.Variant("Enter at 3+", r, Options()),
            X.Variant("Enter at 4+", X.with_rules(r, score={"half_size_at": 4}), Options()),
        ],
        feats,
        mkt,
        *X.FULL,
        r.backtest.walk_forward.train_days,
        r.backtest.walk_forward.test_days,
    )

    names = list(full.index)
    plan, core_only, hold, usd2 = names[0], names[1], names[2], names[3]
    b = full["btc_multiple"] * start_btc
    sleeve_effect = b[plan] - b[core_only]
    cycle_effect = b[core_only] - b[hold]

    # attribution of the plan's core over the full period
    tr = full_runs[plan].trades
    core = tr[tr["coin_id"] == "bitcoin"]
    sold = core[core["reason"].str.contains("euphoria")]
    rebought = core[core["reason"].str.startswith("rebuy")]
    routed = core[core["reason"] == "profit_routing"]["qty"].sum()
    eq = full_runs[plan].equity
    sleeve = eq["sleeve_value_btc"]
    sleeve_start = start_btc * r.portfolio.sleeve_frac
    cycle_net = rebought["qty"].sum() - sold["qty"].sum()
    other = b[plan] - start_btc - cycle_net - routed - (sleeve.iloc[-1] - sleeve_start)

    # --- charts ----------------------------------------------------------------------
    series = []
    for name, color, label in (
        (plan, S1, "Your plan"),
        (hold, S2, "Hold BTC"),
        (usd2, S3, "Program doc (USD buckets)"),
    ):
        n = full_runs[name].equity["net_btc"]
        series.append((label, n / n.iloc[0] * start_btc, color))
    _lines(
        IMG / "full-btc.png",
        f"Total BTC, starting from {start_btc:g} BTC (2019 to 2026)",
        "BTC (net of tax reserve)",
        series,
        legend="center right",
    )

    core_btc = eq["vault_btc"] + eq["vault_usd"] / eq["btc_close"]
    _lines(
        IMG / "plan-parts.png",
        "Your plan, split into core and sleeve (in BTC)",
        "BTC",
        [("Core (incl. stables waiting to rebuy)", core_btc, S1), ("Alt sleeve", sleeve, S2)],
        legend="center left",
    )

    dd = []
    for (name, res), color in zip(list(q3_runs.items())[:2], (S1, S2), strict=True):
        s = res.equity["sleeve_value_btc"]
        dd.append((name.split(" (")[0], -(1 - s / s.cummax()) * 100, color))
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    for name, s, color in dd:
        ax.plot(s.index, s.values, color=color, linewidth=2, label=name)
    _style(ax, "Alt sleeve drawdown in BTC: regime switch vs always Expand", "% below prior peak")
    ax.legend(frameon=False, fontsize=9, labelcolor=INK, loc="lower left")
    fig.savefig(IMG / "q3-drawdown.png", bbox_inches="tight")
    plt.close(fig)

    fig, axes = plt.subplots(1, len(X.TOPS), figsize=(15, 3.8), dpi=150)
    for ax, (cycle, top) in zip(axes, X.TOPS.items(), strict=True):
        t = pd.Timestamp(top)
        w = btc.loc[t - pd.Timedelta(days=300) : t + pd.Timedelta(days=200)]
        ax.plot(w.index, w.values, color=S1, linewidth=2)
        row = q4.loc[cycle]
        marks = (("tier1_date", "3 flags"), ("tier2_date", "5 flags"), ("tier3_date", "exit"))
        for i, (key, lab) in enumerate(marks):
            d = row[key]
            if d is not None and pd.Timestamp(d) in w.index:
                ax.axvline(pd.Timestamp(d), color=S2, linewidth=1.2, linestyle="--")
                left = i % 2 == 0  # alternate sides so tiers days apart don't overprint
                ax.annotate(
                    lab,
                    (pd.Timestamp(d), w.max()),
                    xytext=(-2 if left else 2, 0),
                    textcoords="offset points",
                    fontsize=8,
                    color=INK2,
                    rotation=90,
                    va="top",
                    ha="right" if left else "left",
                )
        _style(ax, f"{cycle} top", "BTC (USD)" if cycle == "2017" else "")
        ax.tick_params(axis="x", labelrotation=45)
    fig.tight_layout()
    fig.savefig(IMG / "q4-tops.png", bbox_inches="tight")
    plt.close(fig)

    # --- text --------------------------------------------------------------------------
    def run_line(label):
        t = runs[label][0]["btc_multiple"] * start_btc
        return (
            f"| {label} | {t[plan]:.2f} | {t[core_only]:.2f} | {t[hold]:.2f} | "
            f"{t[usd2]:.2f} | {alts_bench[label][20]:.2f}x | {alts_bench[label][100]:.2f}x |"
        )

    q4_md = q4.copy()
    for c in [c for c in q4_md.columns if c.endswith("_vs_top")]:
        q4_md[c] = q4_md[c].map(lambda x: "" if x is None or pd.isna(x) else f"{x:+.0%}")
    q4_md["btc_top_usd"] = q4_md["btc_top_usd"].map(lambda x: f"${x:,.0f}")
    q4_md = q4_md.drop(columns=[c for c in q4_md.columns if c.endswith("_days_from_top")])

    q1_md = "\n\n".join(f"**{k}**\n\n{_table(t, start_btc)}" for k, (t, _) in q1.items())
    oi_from = oi["date"].min().date() if oi is not None and len(oi) else "not loaded"
    wf_line = (
        f"chooser {wf['chooser'].prod():.3f}x, always 3+ {wf['Enter at 3+'].prod():.3f}x, "
        f"always 4+ {wf['Enter at 4+'].prod():.3f}x (total-portfolio BTC multiple, "
        f"chained over {len(wf)} six-month test windows)"
    )

    md = f"""# Phase 0 backtest report

Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC · config hash `{cfg.config_hash}` (rules
v{r.version}) · regenerate with `uv run rotation report`.

**Everything is measured in BTC**, net of the tax reserve (treated as owed). The plan
tested is Matt's (2026-09-24): **{start_btc:g} BTC, {1 - r.portfolio.sleeve_frac:.0%} kept as a
BTC core that is never sold to rebalance, {r.portfolio.sleeve_frac:.0%} as an alt sleeve that
runs every rule.** Idle sleeve money is held as BTC. Sleeve losses are never topped up.

## Headline: 2019-01-01 to 2026-09-22

{_table(full, start_btc)}

![Total BTC](img/full-btc.png)

**Where the plan's BTC came from**

| Source | BTC |
|---|---|
| Start | {start_btc:.2f} |
| Cycle-top exit on the core (rule 10): sold {sold["qty"].sum():.2f} BTC near the highs, rebought {rebought["qty"].sum():.2f} BTC after a 50%+ crash | {cycle_net:+.2f} |
| Alt profits routed into the core (rule 5) | {routed:+.2f} |
| Alt sleeve itself: {sleeve_start:.2f} BTC at the start, {sleeve.iloc[-1]:.2f} BTC at the end | {sleeve.iloc[-1] - sleeve_start:+.2f} |
| Tax reserve and other | {other:+.2f} |
| **End** | **{b[plan]:.2f}** |

Against the same core with no alts, the alt sleeve changed the result by
**{sleeve_effect:+.2f} BTC**. Against plain holding, the cycle-top exit changed it by
**{cycle_effect:+.2f} BTC**.

![Core and sleeve](img/plan-parts.png)

**The same designs in the two alt runs** ({start_btc:g} BTC at the start; alt baskets are
equal-weight and point-in-time, shown as a BTC multiple)

| Run | Your plan | Core only | Hold BTC | Program doc (USD) | Top-20 alts | Top-100 alts |
|---|---|---|---|---|---|---|
{run_line("2020-21 run")}
{run_line("2023-25 run")}

Run windows end at the cycle top, so BTC the core moved to stables near that top is still
waiting for the rebuy and counts at the top's price.

**Context: alts vs BTC.** An equal-weight basket of the top-20 alts ended 2019-26 at
{alts_bench["2019-26"][20]:.2f}x its starting BTC value; the top-100 at
{alts_bench["2019-26"][100]:.2f}x. Alts beat BTC in 2017 and, broadly, in 2020-21, and lost to it
in every other stretch tested.

## Q1. Profit ladder vs hold

{q1_md}

## Q2. Does the ALT/BTC 50D gate help?

{_table(q2, start_btc)}

## Q3. Does the BTC 200D regime switch cut drawdown?

In your plan the regime only steers the alt sleeve, so the drawdown that matters is the
sleeve's.

![Q3](img/q3-drawdown.png)

{_table(q3, start_btc)}

## Q4. Would the flags + backstop have exited near the tops?

"vs top" is BTC's price when that tier first fired, relative to the cycle high. Tier 1 = 3
flags (sell 25% of alts); tier 2 = 5 flags (sell 50% more + 20% of the core to stables);
tier 3 = 6 flags or the 20-week backstop (exit alts + another 20% of the core).

![Q4](img/q4-tops.png)

{q4_md.to_markdown()}

## Q5. Score threshold: enter at 3+ vs 4+ only

{_table(q5, start_btc)}

Walk-forward (train {r.backtest.walk_forward.train_days} days, test
{r.backtest.walk_forward.test_days} days, pick whichever did better in training): {wf_line}.

## Data quality

| Input | Status |
|---|---|
| Point-in-time top 100, incl. dead coins | Full: CoinGecko Analyst backfill, 57,781 coins |
| Prices | CoinMetrics reference rate for BTC (all dates) and 88 alts before 2019; CoinGecko otherwise |
| Funding | Binance perps from 2020-01; 318 coins mapped and price-validated |
| Open interest | Binance from {oi_from}; before that "not crowded" uses funding alone |
| Known perp gaps | TON before 2026-07 (ticker rebrand), MKR, FTM, BTT (migrations): no funding/OI |
| Token unlocks, exchange count, catalyst | Not available historically: those gates pass by default |
| Flags without data | per cycle in the Q4 table (`flags_missing_data`) |
| 2017-18 alt prices | CoinGecko-only where CoinMetrics has no series: noisy |

Three cycles is a small sample. These results show the direction and size of each rule's
effect on this history; they cannot prove statistical significance.
"""
    path = OUT / "phase0-report.md"
    path.write_text(md)
    tables = {
        "designs_full": full,
        "q1": pd.concat({k: t for k, (t, _) in q1.items()}),
        "q2": q2,
        "q3": q3,
        "q4": q4,
        "q5": q5,
        "walk_forward_q5": wf,
        **{f"designs_{k.split()[0]}": v[0] for k, v in runs.items()},
    }
    for name, df in tables.items():
        df.to_csv(OUT / f"{name}.csv")
    for stale in (
        "vault.csv",
        "full.csv",
        "img/full-btc-multiple.png",
        "img/q1-2020-21.png",
        "img/q1-2023-25.png",
    ):
        (OUT / stale).unlink(missing_ok=True)
    return path
