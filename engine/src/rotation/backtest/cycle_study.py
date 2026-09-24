"""Cycle-harvest study: parameter grid, leave-one-cycle-out, forward test, report.

Honesty rules:
  - A cycle is only scored with settings chosen WITHOUT it (leave-one-cycle-out).
  - The 2024 cycle is a true forward test: settings chosen on 2012-2020 only.
  - Four cycles is a tiny sample; the report says so.
"""

from __future__ import annotations

import itertools
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from rotation.backtest.cycle_sim import run_cycle
from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.cycle import cycle_features, rules_from_config

HALVINGS = [pd.Timestamp(d) for d in get_config().rules.cycle.halvings]
COMPLETE = [h.date() for h in HALVINGS[:3]]
OUT = REPO_ROOT / "docs" / "backtests"

GRID = {
    "window_start_days": [400, 450, 500],
    "window_end_days": [580, 640, 700],
    "clock_share": [0.0, 0.5, 1.0],
    "start_days_since_ath": [240, 300, 360],
    "start_drawdown": [0.70, 0.80, 1.01],  # 1.01 = drawdown trigger off
}


def load_features() -> pd.DataFrame:
    px = cache.read("universe", "prices")
    btc = px[px["coin_id"] == "bitcoin"].set_index("date")["price_usd"].sort_index()
    mvrv = cache.read("coinmetrics", "btc").set_index("date")["mvrv"]
    return cycle_features(btc, mvrv, HALVINGS, get_config().rules.cycle.sell.trend_weekly_sma)


def rules_for(params: dict, target: float):
    """Config rules with the grid's parameters and target swapped in."""
    sell, buy = rules_from_config(get_config().rules.cycle)
    sell = replace(
        sell,
        target_frac=target,
        window_start_days=params["window_start_days"],
        window_end_days=params["window_end_days"],
        clock_share=params["clock_share"],
    )
    buy = replace(
        buy,
        start_days_since_ath=params["start_days_since_ath"],
        start_drawdown=params["start_drawdown"],
    )
    return sell, buy


def grid_results(f: pd.DataFrame, target: float, tax: float, fee: float) -> pd.DataFrame:
    keys = list(GRID)
    rows = []
    for values in itertools.product(*GRID.values()):
        p = dict(zip(keys, values, strict=True))
        sell, buy = rules_for(p, target)
        pc = run_cycle(f, sell, buy, fee=fee, tax_rate=tax).per_cycle
        rows.append({**p, **{str(c): pc.loc[c, "multiple"] for c in pc.index}})
    return pd.DataFrame(rows)


def leave_one_out(g: pd.DataFrame) -> pd.DataFrame:
    """For each complete cycle: best settings on the other complete cycles, scored on it.
    Plus the forward test: best on all complete cycles, scored on 2024."""
    cyc = [str(c) for c in COMPLETE]
    out = []
    for held in [*cyc, str(HALVINGS[3].date())]:
        train = [c for c in cyc if c != held]
        score = np.log(g[train]).sum(axis=1)
        best = g.loc[score.idxmax()]
        out.append(
            {
                "held_out_cycle": held,
                "trained_on": ", ".join(train),
                "held_out_multiple": best[held],
                **{k: best[k] for k in GRID},
            }
        )
    return pd.DataFrame(out).set_index("held_out_cycle")


def build(start_btc: float = 11.0, tax: float | None = None, fee: float | None = None) -> Path:
    acct = get_config().rules.cycle.account
    tax = acct.tax_rate if tax is None else tax
    fee = acct.fee_per_trade if fee is None else fee
    f = load_features()
    img = OUT / "img"
    img.mkdir(parents=True, exist_ok=True)

    results = {}
    for target in (1 / 3, 1 / 2):
        g = grid_results(f, target, tax, fee)
        results[target] = (g, leave_one_out(g))
    g3, loo3 = results[1 / 3]
    g2, loo2 = results[1 / 2]

    # the settings a person would actually use today: chosen on all complete cycles
    chosen = loo3.loc[str(HALVINGS[3].date()), list(GRID)].to_dict()
    sell, buy = rules_for(chosen, 1 / 3)
    run = run_cycle(f, sell, buy, start_btc=start_btc, fee=fee, tax_rate=tax)
    alt_tax = 0.15 if tax == 0 else 0.0
    run0 = run_cycle(f, sell, buy, start_btc=start_btc, fee=fee, tax_rate=alt_tax)
    run_half = run_cycle(
        f,
        *rules_for(loo2.loc[str(HALVINGS[3].date()), list(GRID)].to_dict(), 1 / 2),
        start_btc=start_btc,
        fee=fee,
        tax_rate=tax,
    )

    # robustness: how many of all settings beat holding in every complete cycle?
    cyc = [str(c) for c in COMPLETE]
    share_all_win = (g3[cyc] > 1).all(axis=1).mean()
    worst = g3[cyc].min(axis=1)

    d = run.daily
    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    ax.plot(d.index, d["btc_equiv"], color="#2a78d6", linewidth=2, label="Cycle harvest (1/3)")
    ax.axhline(start_btc, color="#eb6834", linewidth=2, label="Hold")
    for t in run.trades.itertuples():
        ax.plot(
            t.date,
            d.loc[t.date, "btc_equiv"],
            "v" if t.side == "sell" else "^",
            color="#52514e",
            markersize=4,
        )
    ax.set_title(
        f"BTC held (incl. USDT at market), starting from {start_btc:g} BTC",
        loc="left",
        fontsize=12,
        fontweight="bold",
    )
    ax.set_ylabel("BTC equivalent")
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.grid(axis="y", color="#e6e5e0")
    ax.legend(frameon=False, loc="upper left")
    ax.annotate(
        f"{d['btc_equiv'].iloc[-1]:.2f}",
        (d.index[-1], d["btc_equiv"].iloc[-1]),
        xytext=(6, 0),
        textcoords="offset points",
        va="center",
    )
    fig.savefig(img / "cycle-harvest.png", bbox_inches="tight")
    plt.close(fig)

    tr = run.trades.copy()
    tr["date"] = tr["date"].dt.date
    tr = tr.round({"btc": 3, "usd": 0, "tax": 0, "px": 0})

    def pc_md(res):
        p = res.per_cycle.copy()
        p["multiple"] = p["multiple"].map(lambda x: f"{x:.3f}x")
        return p.round(3).to_markdown()

    def loo_md(loo):
        x = loo.copy()
        x["held_out_multiple"] = x["held_out_multiple"].map(lambda v: f"{v:.3f}x")
        return x.to_markdown()

    md = f"""# BTC cycle harvest: study

Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC · regenerate with `uv run rotation cycle-report`.

**Goal (Matt, 2026-09-24):** grow the BTC count. Sell at least a third of the stack near each
cycle top into USDT, then deploy it back into BTC near the bear-market bottom. No round trips.
Scored in BTC: a cycle multiple of 1.10x means 10% more BTC at the next halving than at this one.
Fees {fee:.1%} per trade; tax reserved at {tax:.0%} of each sale's gain (0% shown for comparison).

## The rule

**Sell (from day `window_start` to `window_end` after each halving):** a share of the target
(`clock_share`) is sold in 4 evenly spaced tranches; the rest of the target is sold on the first
weekly close below the 20-week average after a new all-time high inside the window.

**Buy:** start deploying the USDT in 4 monthly tranches once BTC has gone `start_days_since_ath`
days without a new high, or is `start_drawdown` below it, or MVRV < 1. Deploy everything left
540 days after the high, or at once if BTC makes a new all-time high (the bottom was missed).

## Honest test: every cycle scored with settings chosen without it

Sell a third:

{loo_md(loo3)}

Sell half:

{loo_md(loo2)}

The last row of each table is a true forward test: settings chosen on 2012-2020 only, then applied
to the 2024 cycle (still in progress: its USDT is valued at today's price).

**Robustness:** of all {len(g3)} setting combinations tested, {share_all_win:.0%} beat holding in
every complete cycle. The worst complete cycle across all combinations ranged from
{worst.min():.2f}x to {worst.max():.2f}x.

## With today's settings (chosen on 2012-2020), from {start_btc:g} BTC

Settings: {", ".join(f"{k} = {v:g}" for k, v in chosen.items())}.

**Read these tables with care:** these settings were *picked because* they did best on
2012-2020, so the 2012, 2016 and 2020 rows below are in-sample and flatter than reality. The
honest numbers are the held-out table above. Only the 2024 row here is a genuine forward test.

![Cycle harvest](img/cycle-harvest.png)

Tax {tax:.0%}:

{pc_md(run)}

Tax {alt_tax:.0%} (for comparison):

{pc_md(run0)}

Selling half instead of a third (tax {tax:.0%}):

{pc_md(run_half)}

### Every trade (sell a third, tax {tax:.0%})

{tr.to_markdown(index=False)}

## Caveats

- **Four cycles.** Three complete, one in progress. That is enough to see a pattern, not to
  prove one. The halving clock worked for 2016, 2020 and 2024 tops (525-546 days after the
  halving) but the 2013 top came at 371 days: a cycle that breaks the pattern will hurt.
- **The rule is only as good as the next cycle resembling the last three.** The trend-break
  exit and the new-high redeploy are there so a broken pattern costs a slice of upside, not the
  stack.
- **Tax** depends on your cost basis and jurisdiction; this uses one flat rate on each sale's gain.
"""
    path = OUT / "cycle-harvest.md"
    path.write_text(md)
    g3.to_csv(OUT / "cycle_grid_third.csv", index=False)
    g2.to_csv(OUT / "cycle_grid_half.csv", index=False)
    tr.to_csv(OUT / "cycle_trades.csv", index=False)
    return path
