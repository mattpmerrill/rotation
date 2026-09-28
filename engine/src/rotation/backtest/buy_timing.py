"""Research: when in the four-year cycle has buying alts paid off? (2026-09-26)

For every other week since the 2016 halving: put 1 BTC into alts that week, hold, and sell in
the next old sell window (days 500-580 after a halving, averaged, 1% fee each way). The result
is BTC out per BTC in. Two views:

  top10   the ten biggest alts by market cap on the buy day, equal weight (point-in-time:
          no hindsight; coins that later died count as worth nothing)
  <coin>  each of today's top coins on its own (hindsight: these all survived)

Only buy days whose sell window has already passed have a result.

Run: `uv run rotation buy-timing` -> docs/backtests/buy-timing.md and
web/public/data/buy-timing.json (the app's "Best time to buy" page).
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

from rotation.backtest.btc_cycle import HALVINGS, REPORT_DIR
from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.rules.cycle import HALVING_INTERVAL_DAYS

FEE = 0.01
STEP_DAYS = 14
FIRST_ENTRY = pd.Timestamp("2016-07-10")
TOP_N = 10
COINS_FOR_APP = 150


def sell_windows(
    halvings: list[pd.Timestamp], days: tuple[int, int]
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    hs = [*halvings, halvings[-1] + pd.Timedelta(days=HALVING_INTERVAL_DAYS)]
    return [(h + pd.Timedelta(days=days[0]), h + pd.Timedelta(days=days[1])) for h in hs]


def in_btc(prices: pd.DataFrame, btc: pd.Series) -> pd.DataFrame:
    """Daily price of each coin in BTC. Gaps up to 7 days carry the last price; after a coin's
    last price (plus 7 days) it's worth 0; before its first price it's NaN (didn't exist)."""
    r = prices.reindex(btc.index).ffill(limit=7).div(btc, axis=0)
    for c in r.columns:
        last = prices[c].last_valid_index()
        if last is not None:
            r.loc[r.index > last + pd.Timedelta(days=7), c] = 0.0
    return r


def entry_results(
    ratio: pd.DataFrame, entries: pd.DatetimeIndex, windows: list[tuple[pd.Timestamp, pd.Timestamp]]
) -> pd.DataFrame:
    """BTC per BTC for buying each coin on each entry day and selling across the next sell
    window (the part of it after the buy, if bought inside it). NaN when the coin had no price
    on the entry day or the window hasn't finished in the data."""
    end = ratio.index.max()
    out = pd.DataFrame(np.nan, index=entries, columns=ratio.columns)
    for t in entries:
        w = next(((w0, w1) for w0, w1 in windows if w1 > t), None)
        if w is None or w[1] > end:
            continue
        window = ratio.loc[max(w[0], t) : w[1]]
        out.loc[t] = window.mean() / ratio.loc[t] * (1 - FEE) ** 2
    return out.where(ratio.reindex(entries) > 0)


class Study:
    def __init__(self) -> None:
        cfg = get_config().rules.cycle
        px = cache.read("universe", "prices")
        self.ranks = cache.read("universe", "ranks")
        wide = px.pivot_table(index="date", columns="coin_id", values="price_usd").sort_index()
        btc = wide.pop("bitcoin")
        self.btc = btc.dropna()
        self.ratio = in_btc(wide, self.btc)
        self.windows = sell_windows(
            HALVINGS, (cfg.sell.window_start_days, cfg.sell.window_end_days)
        )
        self.entries = pd.date_range(FIRST_ENTRY, self.btc.index.max(), freq=f"{STEP_DAYS}D")
        self.results = entry_results(self.ratio, self.entries, self.windows)

    def top10(self) -> pd.Series:
        vals = {}
        for t in self.entries:
            ranked = self.ranks[self.ranks["date"] == t].sort_values("rank")["coin_id"]
            live = [
                c
                for c in ranked
                if c in self.results.columns and not np.isnan(self.results.at[t, c])
            ]
            vals[t] = np.mean([self.results.at[t, c] for c in live[:TOP_N]]) if live else np.nan
        return pd.Series(vals)

    def day_in_cycle(self, t: pd.Timestamp) -> tuple[int, int]:
        h = max(x for x in HALVINGS if x <= t)
        return h.year, (t - h).days


def _sig(x: float) -> float | None:
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0.0
    return round(x, 2 - math.floor(math.log10(abs(x))))


def build() -> tuple[dict, str]:
    st = Study()
    top10 = st.top10()
    latest = st.ranks["date"].max()
    today_top = st.ranks[st.ranks["date"] == latest].nsmallest(COINS_FOR_APP, "rank")["coin_id"]
    coins = [c for c in today_top if c in st.results.columns and st.results[c].notna().any()]
    days = [st.day_in_cycle(t) for t in st.entries]

    data = {
        "generated": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d"),
        "entries": [str(t.date()) for t in st.entries],
        "cycle": [c for c, _ in days],
        "day": [d for _, d in days],
        "top10": [_sig(v) for v in top10.tolist()],
        "coins": {c: [_sig(v) for v in st.results[c].tolist()] for c in coins},
    }

    # the report: the top-10 result by 90-day stretch of the cycle
    d = pd.DataFrame({"cycle": data["cycle"], "day": data["day"], "top10": top10.values}).dropna()
    d["stretch"] = (d["day"] // 90) * 90
    table = d.pivot_table(index="stretch", columns="cycle", values="top10", aggfunc="median").round(
        2
    )
    table.index = [f"{s}-{s + 89}" for s in table.index]
    report = f"""# Best time to buy alts

Generated by `uv run rotation buy-timing` (`engine/src/rotation/backtest/buy_timing.py`).
Buy the ten biggest alts on the day (equal weight), sell in the next old sell window
(days 500-580 after a halving), 1% fee each way. Median BTC per BTC, by how many days
after the halving the buy was. Blank: that sell window hasn't come yet.

{table.to_markdown()}

{FINDINGS}"""
    return data, report


FINDINGS = """## What it says (Beck, 2026-09-26)

1. **The best time was around the halving**: from about a year before it to about nine months
   after (days ~1080 of one cycle to ~270 of the next). Those buys were sold into the 2017 and
   2021 alt seasons for 1.3-3.2 BTC per BTC.
2. **The worst time was after the top, into the bear** (days ~540-1080). Buys then finished at
   0.46-0.67 in the 2020 cycle, and anywhere from 0.34 to 1.3 in 2016. Today (late Sep 2026)
   is day ~890: in this stretch.
3. **The 2024 cycle had no alt season.** Buys in its first 540 days finished at 0.8-1.1: close
   to holding BTC, and still better than buying after the top.

Three alt seasons is a small sample, and the next one may not come.
"""


def write() -> list[str]:
    data, report = build()
    web = REPO_ROOT / "web" / "public" / "data" / "buy-timing.json"
    web.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    md = REPORT_DIR / "buy-timing.md"
    md.write_text(report)
    return [str(web), str(md)]
