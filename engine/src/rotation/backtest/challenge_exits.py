"""Research: when should a challenge basket be sold? (2026-09-26)

The 1 Bitty Challenge loop: 1 BTC -> an equal-weight alt basket -> sell for USDT on an exit
rule -> rebuy BTC when the bear rebuy rule fires (config `cycle.buy`) -> BTC at the end.
1% fee on every trade (Matt's IRA). Entry at the same point in the cycle as the challenge
start (day ~890 after the halving), plus 90 days either side, in the two cycles the alt
data covers.

Exit rules compared:
  clock     the old sell window (days 500-580 after the next halving, 4 tranches)
  peak      the basket's best day in BTC (hindsight: the ceiling, not a rule)
  ratio20   weekly basket/BTC close below its 20-week average after a new high
  usd20     weekly basket USD close below its 20-week average after a new USD high,
            only after the next halving
  usd20x2   usd20, armed only once the basket has doubled in USD

Baskets: the top 5 and top 10 alts by market cap on the entry day (point-in-time, so no
hindsight), plus two hand-picked baskets from the handoff (hindsight: chosen knowing how
the coins did).

Run: `uv run rotation challenge-exits` -> docs/backtests/challenge-exits.md
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import pairwise

import numpy as np
import pandas as pd

from rotation.backtest.btc_cycle import HALVINGS, REPORT_DIR, load_features
from rotation.config import get_config
from rotation.data import cache
from rotation.rules.cycle import buy_started, clock_tranche_days, rules_from_config
from rotation.rules.indicators import sma, weekly_close

FEE = 0.01
ENTRY_DAY = 889  # days after the 2024 halving on 2026-09-26, the challenge start
OFFSETS = (-90, 0, 90)
HAND_PICKED = {
    "XRP/BNB/SOL/DOGE/LINK": ["ripple", "binancecoin", "solana", "dogecoin", "chainlink"],
    "ETH/SOL/BNB/SUI/XRP/DOGE": ["ethereum", "solana", "binancecoin", "sui", "ripple", "dogecoin"],
}


@dataclass(frozen=True)
class Exit:
    name: str
    series: str  # "ratio" or "usd"
    sma_weeks: int
    min_gain: float
    after_halving: bool


EXITS = [
    Exit("ratio20", "ratio", 20, 1.0, False),
    Exit("usd20", "usd", 20, 1.0, True),
    Exit("usd20x2", "usd", 20, 2.0, True),
]


def trend_break(
    s: pd.Series, sma_weeks: int, min_gain: float, start: pd.Timestamp
) -> pd.Timestamp | None:
    """First weekly close below the `sma_weeks` average after a new high of at least
    `min_gain` (a close above its average), counting from `start`. None if it never breaks."""
    wk = weekly_close(s)
    avg = sma(wk, sma_weeks)
    high, armed = -np.inf, False
    for t in wk.index:
        high = max(high, wk[t])
        if t < start or np.isnan(avg[t]):
            continue
        if wk[t] >= high and wk[t] >= min_gain and wk[t] > avg[t]:
            armed = True
        elif armed and wk[t] < avg[t]:
            return t
    return None


class Study:
    def __init__(self) -> None:
        sell, self.buy = rules_from_config(get_config().rules.cycle)
        self.clock_days = clock_tranche_days(sell)
        self.f = load_features()
        self.btc = self.f["btc"]
        px = cache.read("universe", "prices")
        self.ranks = cache.read("universe", "ranks")
        self.wide = px.pivot_table(index="date", columns="coin_id", values="price_usd").sort_index()
        self.end = self.btc.index.max()

    def basket_btc(self, coins: list[str], entry: pd.Timestamp) -> tuple[pd.Series, list[str]]:
        """BTC value over time of 1 BTC put into the coins equally on `entry` (before fees).
        A coin whose prices stop for more than 7 days counts as dead (0)."""
        have = [c for c in coins if c in self.wide and not np.isnan(self.wide.at[entry, c])]
        seg = self.wide[have].loc[entry:].ffill()
        for c in have:
            last = self.wide[c].last_valid_index()
            if (self.end - last).days > 7:
                seg.loc[seg.index > last + pd.Timedelta(days=7), c] = 0.0
        usd = (seg / seg.iloc[0]).mean(axis=1)
        return (usd / (self.btc.loc[entry:] / self.btc[entry])).dropna(), have

    def rebuy(self, btc_value: float, sold_on: pd.Timestamp) -> float | None:
        """BTC after holding the sale's USDT until the bear rebuy rule fires, then buying in
        monthly tranches (the rest at once on the deadline or a new high). None if the rule
        hasn't fired yet in the data."""
        usd = btc_value * self.btc[sold_on]
        after = self.f.loc[sold_on:]
        fired = after[[buy_started(r, self.buy) for _, r in after.iterrows()]]
        if fired.empty:
            return None
        start = fired.index[0]
        deadline = start - pd.Timedelta(days=int(self.f.at[start, "days_since_ath"]))
        deadline += pd.Timedelta(days=self.buy.deadline_days_since_ath)
        got, left = 0.0, usd
        for k in range(self.buy.tranches):
            t = start + pd.Timedelta(days=k * self.buy.spacing_days)
            if t > self.end:
                return None
            last = k == self.buy.tranches - 1
            new_high = t > start and self.f.at[t, "days_since_ath"] == 0
            amt = left if (last or t >= deadline or new_high) else usd / self.buy.tranches
            got += amt * (1 - FEE) / self.btc[t]
            left -= amt
            if left <= 0:
                break
        return got

    def run(
        self, name: str, coins: list[str], entry: pd.Timestamp, next_halving: pd.Timestamp
    ) -> dict:
        ratio, have = self.basket_btc(coins, entry)
        usd = ratio * self.btc.loc[ratio.index] / self.btc[entry]
        two_fees = (1 - FEE) ** 2
        clock_dates = [next_halving + pd.Timedelta(days=d) for d in self.clock_days]
        clock = np.mean([ratio.asof(t) for t in clock_dates]) * two_fees
        out = {
            "basket": name,
            "entry": entry.date(),
            "coins": len(have),
            "low": round(float(ratio.min()), 2),
            "peak": f"{ratio.max() * two_fees:.2f} ({ratio.idxmax():%b %Y})",
            "clock": self._loop(clock, clock_dates[-1]),
        }
        for x in EXITS:
            s = ratio if x.series == "ratio" else usd
            start = next_halving if x.after_halving else entry
            t = trend_break(s, x.sma_weeks, x.min_gain, start)
            out[x.name] = (
                "no signal" if t is None else f"{t:%b %Y}: {self._loop(ratio[t] * two_fees, t)}"
            )
        return out

    def _loop(self, sold_btc: float, sold_on: pd.Timestamp) -> str:
        final = self.rebuy(sold_btc, sold_on)
        return f"{sold_btc:.2f}" + (" → rebuy pending" if final is None else f" → {final:.2f}")

    def btc_only(self, next_halving: pd.Timestamp) -> str:
        """Benchmark: sell 1 BTC on the clock, rebuy in the bear, no alts."""
        dates = [next_halving + pd.Timedelta(days=d) for d in self.clock_days]
        usd = np.mean([self.btc[t] for t in dates]) * (1 - FEE)
        return self._loop(usd / self.btc[dates[-1]], dates[-1])


def build() -> str:
    st = Study()
    rows, bench = [], []
    for h, nh in pairwise(HALVINGS[1:4]):
        bench.append(f"- {h:%Y} cycle: {st.btc_only(nh)} BTC")
        for off in OFFSETS:
            entry = h + pd.Timedelta(days=ENTRY_DAY + off)
            ranked = st.ranks[st.ranks["date"] == entry].sort_values("rank")["coin_id"]
            live = [c for c in ranked if c in st.wide and not np.isnan(st.wide.at[entry, c])]
            baskets = {"top 5 then": live[:5], "top 10 then": live[:10]}
            if off == 0:
                baskets |= HAND_PICKED
            rows += [st.run(n, cs, entry, nh) for n, cs in baskets.items()]
    table = pd.DataFrame(rows).to_markdown(index=False)
    return "\n".join(
        [
            "# Challenge exits: when to sell the basket",
            "",
            (
                "Generated by `uv run rotation challenge-exits` "
                "(`engine/src/rotation/backtest/challenge_exits.py`)."
            ),
            (
                "1 BTC in, 1% fee per trade, BTC out. `a → b`: BTC at the sale → BTC after "
                "the bear rebuy. The 2022 cycle's rebuy hasn't happened yet (BTC's last high "
                "was Oct 2025)."
            ),
            "",
            table,
            "",
            "Benchmark, no alts (sell 1 BTC on the clock, rebuy in the bear):",
            *bench,
            "",
            FINDINGS,
        ]
    )


FINDINGS = """## What it says (Beck, 2026-09-26)

1. **No trend alert beat the clock.** In the 2018 cycle every alert that fired sold earlier
   than the clock and ended with less BTC after the rebuy (e.g. top 10: clock 3.83, usd20
   2.26). On the best hand-picked basket the alerts fired in 2019-2020 and missed the 2021
   run (13.21 on the clock vs 1.49-2.51). In the 2022 cycle the alerts sold at about the same
   BTC as the clock (0.55-0.78 vs 0.51-0.80). The basket/BTC ratio alert mostly never fired.
2. **The rebuy is where the BTC comes from.** Selling near the top and rebuying in the bear
   multiplied every 2018 basket by about 2.5x, and 1 BTC with no alts at all did the same
   (0.97 → 2.46). The alt pick decides whether you beat that.
3. **Point-in-time baskets lost BTC at the sale in 5 of 6 cases in the good cycle and all 6 in
   the bad one.** The 5-10x results only come from baskets picked with hindsight.

So the app ships no "sell now" alert. It shows reference dates (the old sell window, ~500-580
days after the halving) and alerts when the bear rebuy window opens, which the cycle-harvest
backtest supports (`docs/backtests/cycle-harvest.md`). Each person still decides when to sell.
"""


def write() -> str:
    out = REPORT_DIR / "challenge-exits.md"
    out.write_text(build())
    return str(out)
