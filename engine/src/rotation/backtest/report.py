"""Run every Phase 0 experiment and write docs/backtests/phase0-report.md + charts.

The findings text is written from the numbers at run time, so the report never
disagrees with its own tables. Judgement calls are marked as such.
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

# Reference palette, light mode (validated: tools/dataviz validate_palette, 3 slots pass;
# aqua < 3:1 contrast -> every chart is direct-labelled and has a table beside it).
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


def _label_end(ax, s: pd.Series, text: str, color: str) -> None:
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
        f"{text}  {s.iloc[-1]:.2f}x",
        (s.index[-1], s.iloc[-1]),
        xytext=(8, 0),
        textcoords="offset points",
        va="center",
        fontsize=9,
        color=INK,
    )


def _lines(
    path: Path, title: str, ylabel: str, series: list[tuple[str, pd.Series, str]], log: bool = False
) -> None:
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    for name, s, color in series:
        ax.plot(s.index, s.values, color=color, linewidth=2, label=name)
        _label_end(ax, s, name, color)
    if log:
        ax.set_yscale("log")
    _style(ax, title, ylabel)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK, loc="upper left")
    fig.subplots_adjust(right=0.78)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def _fmt(df: pd.DataFrame) -> str:
    cols = {
        "btc_multiple": "BTC multiple",
        "usd_multiple": "USD multiple",
        "max_dd_usd": "Max drawdown (USD)",
        "max_dd_btc": "Max drawdown (BTC)",
        "alt_entries": "Alt entries",
        "fees_btc_equiv": "Fees (BTC)",
        "avg_alt_weight": "Avg alt weight",
    }
    d = df[list(cols)].rename(columns=cols).copy()
    for c in ("BTC multiple", "USD multiple"):
        d[c] = d[c].map(lambda x: f"{x:.2f}x")
    for c in ("Max drawdown (USD)", "Max drawdown (BTC)", "Avg alt weight"):
        d[c] = d[c].map(lambda x: f"{x:.0%}")
    d["Fees (BTC)"] = d["Fees (BTC)"].map(lambda x: f"{x:.2f}")
    return d.to_markdown()


def _bench_md(b: dict) -> str:
    return "\n".join(f"| {k} | {v:.2f}x |" for k, v in b.items())


def build() -> Path:
    cfg = get_config()
    r = cfg.rules
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

    # --- run everything -------------------------------------------------------
    full_tbl, full_runs = X.compare(
        [X.Variant("Rotation (rules)", r, Options())], feats, mkt, *X.FULL
    )
    full_bench = X.benchmarks(ranks, prices, btc, *X.FULL, cost)
    q1 = X.q1_ladder_vs_hold(r, feats, mkt)
    q1_bench = {k: X.benchmarks(ranks, prices, btc, a, b, cost) for k, (a, b) in X.RUNS.items()}
    q2_tbl, _ = X.q2_altbtc_gate(r, feats, mkt)
    q3_tbl, q3_runs = X.q3_regime_switch(r, feats, mkt)
    q4 = X.q4_top_exits(mkt, fl)
    q5_tbl, _ = X.q5_score_threshold(r, feats, mkt)
    vault_tbl, _ = X.vault_policy(r, feats, mkt)
    wf_q5 = X.walk_forward(
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

    # --- charts ------------------------------------------------------------------
    e = full_runs["Rotation (rules)"].equity
    rot = e["net_btc"] / e["net_btc"].iloc[0]
    hodl = pd.Series(1 - cost, index=rot.index)
    top20 = alt_index(ranks, prices[prices.coin_id != "bitcoin"], btc, *X.FULL, 20, cost)
    _lines(
        IMG / "full-btc-multiple.png",
        "Value in BTC, 2019 to 2026 (start = 1.0)",
        "BTC multiple (log scale)",
        [("Rotation rules", rot, S1), ("HODL BTC", hodl, S2), ("Top-20 alts", top20, S3)],
        log=True,
    )
    for label, (tbl, runs) in q1.items():
        slug = label.split()[0]
        series = []
        for (name, res), color in zip(runs.items(), (S1, S2), strict=True):
            n = res.equity["net_btc"]
            series.append((name.split(" (")[0], n / n.iloc[0], color))
        _lines(
            IMG / f"q1-{slug}.png",
            f"Ladder vs hold, {label} (value in BTC)",
            "BTC multiple",
            series,
        )
    dd = []
    for (name, res), color in zip(list(q3_runs.items())[:2], (S1, S2), strict=True):
        v = res.equity["value_usd"]
        dd.append((name.split(" (")[0], -(1 - v / v.cummax()), color))
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    for name, s, color in dd:
        ax.plot(s.index, s.values * 100, color=color, linewidth=2, label=name)
    _style(ax, "Drawdown in USD: regime switch vs always Expand", "% below prior peak")
    ax.legend(frameon=False, fontsize=9, labelcolor=INK, loc="lower left")
    fig.savefig(IMG / "q3-drawdown.png", bbox_inches="tight")
    plt.close(fig)

    fig, axes = plt.subplots(1, len(X.TOPS), figsize=(15, 3.8), dpi=150)
    for ax, (cycle, top) in zip(axes, X.TOPS.items(), strict=True):
        t = pd.Timestamp(top)
        w = btc.loc[t - pd.Timedelta(days=300) : t + pd.Timedelta(days=200)]
        ax.plot(w.index, w.values, color=S1, linewidth=2)
        row = q4.loc[cycle]
        for key, lab in (
            ("tier1_date", "3 flags"),
            ("tier2_date", "5 flags"),
            ("tier3_date", "exit tier"),
        ):
            d = row[key]
            if d is not None and pd.Timestamp(d) in w.index:
                ax.axvline(pd.Timestamp(d), color=S2, linewidth=1.2, linestyle="--")
                ax.annotate(
                    lab,
                    (pd.Timestamp(d), w.max()),
                    fontsize=8,
                    color=INK2,
                    rotation=90,
                    va="top",
                    ha="right",
                )
        _style(ax, f"{cycle} top", "BTC (USD)" if cycle == "2017" else "")
        ax.tick_params(axis="x", labelrotation=45)
    fig.tight_layout()
    fig.savefig(IMG / "q4-tops.png", bbox_inches="tight")
    plt.close(fig)

    # --- text ----------------------------------------------------------------------
    rules_mult = full_tbl.loc["Rotation (rules)", "btc_multiple"]
    oi_from = oi["date"].min().date() if oi is not None and len(oi) else "n/a"
    q4_md = q4.copy()
    for c in [c for c in q4_md.columns if c.endswith("_vs_top")]:
        q4_md[c] = q4_md[c].map(lambda x: "" if x is None or pd.isna(x) else f"{x:+.0%}")
    q4_md["btc_top_usd"] = q4_md["btc_top_usd"].map(lambda x: f"${x:,.0f}")
    q3r = q3_tbl
    q1_lines = []
    for label, (tbl, _) in q1.items():
        lad, hold = tbl.iloc[0], tbl.iloc[1]
        q1_lines.append(
            f"- **{label}:** ladder {lad.btc_multiple:.2f}x vs hold {hold.btc_multiple:.2f}x in BTC "
            f"(HODL BTC {q1_bench[label]['HODL BTC']:.2f}x, top-100 alts "
            f"{q1_bench[label]['Top-100 alts (equal weight)']:.2f}x)."
        )
    wf_summary = (
        f"chooser {wf_q5['chooser'].prod():.2f}x, always 3+ {wf_q5['Enter at 3+'].prod():.2f}x, "
        f"always 4+ {wf_q5['Enter at 4+'].prod():.2f}x over {len(wf_q5)} six-month test windows"
    )

    md = f"""# Phase 0 backtest report

Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC from config hash `{cfg.config_hash}`
(rules v{r.version}). Regenerate: `uv run rotation report`.

**All results are measured in BTC**, net of the tax reserve (treated as owed). A BTC
multiple of 1.00x means "ended with as much BTC as it started with"; buying BTC on day one
and holding scores {1 - cost:.3f}x after the purchase fee.

## Headline

| 2019-01-01 to 2026-09-22 | BTC multiple |
|---|---|
| **Rotation rules** | **{rules_mult:.2f}x** |
{_bench_md(full_bench)}

![Value in BTC](img/full-btc-multiple.png)

{_fmt(full_tbl)}

## Q1. Profit ladder vs hold, in BTC

{chr(10).join(q1_lines)}

![Q1 2020-21](img/q1-2020-21.png)
![Q1 2023-25](img/q1-2023-25.png)

{chr(10).join(f"**{k}**{chr(10)}{chr(10)}{_fmt(t)}{chr(10)}" for k, (t, _) in q1.items())}

## Q2. Does the ALT/BTC 50D gate help?

{_fmt(q2_tbl)}

## Q3. Does the BTC 200D regime switch cut drawdown?

Max drawdown in USD: regime switch {q3r.iloc[0].max_dd_usd:.0%}, always Expand
{q3r.iloc[1].max_dd_usd:.0%}, always Accumulate {q3r.iloc[2].max_dd_usd:.0%}.

![Q3 drawdown](img/q3-drawdown.png)

{_fmt(q3_tbl)}

## Q4. Would the flags + backstop have exited near the tops?

"vs top" is BTC's price when that tier first fired, relative to the cycle high
(negative = below the top). Tier 1 = 3 flags (sell 25% of alts), tier 2 = 5 flags
(sell 50% more + 20% of the Vault), tier 3 = 6 flags or the 20-week backstop (exit alts +
another 20% of the Vault).

![Q4 tops](img/q4-tops.png)

{q4_md.to_markdown()}

## Q5. Score threshold: enter at 3+ vs 4+ only

{_fmt(q5_tbl)}

Walk-forward (train {r.backtest.walk_forward.train_days} days, test
{r.backtest.walk_forward.test_days} days, pick the variant that did better in training):
{wf_summary}.

## Open question: Vault rebalancing

The program doc gives Vault targets per regime but does not say whether the Vault is
ever *sold* to get back to target. The two readings behave very differently:

{_fmt(vault_tbl)}

## Data quality and what is missing

| Input | Status in this backtest |
|---|---|
| Point-in-time top 100, incl. dead coins | Full (CoinGecko Analyst backfill, 57,781 coins) |
| Prices | CoinMetrics reference rate for BTC (all dates) and 88 alts (pre-2019); CoinGecko otherwise |
| Funding | Binance perps from 2020-01; 318 coins mapped and price-validated |
| Open interest | Binance, from {oi_from}; before that "not crowded" is judged on funding alone |
| Token unlocks, exchange count, catalyst | **Not available historically**: gates pass by default (live-only) |
| Flags without data | listed per cycle in the Q4 table (`flags_missing_data`) |
| 2017-18 alt prices | CoinGecko-only for coins CoinMetrics doesn't cover: noisy (BTC's CoinGecko series was off by up to 21% on the worst days) |

Three cycles is a small sample. These results show the direction and size of each rule's
effect on this history; they cannot prove statistical significance.
"""
    path = OUT / "phase0-report.md"
    path.write_text(md)
    for name, df in {
        "q1": pd.concat({k: t for k, (t, _) in q1.items()}),
        "q2": q2_tbl,
        "q3": q3_tbl,
        "q4": q4,
        "q5": q5_tbl,
        "vault": vault_tbl,
        "walk_forward_q5": wf_q5,
        "full": full_tbl,
    }.items():
        df.to_csv(OUT / f"{name}.csv")
    return path
