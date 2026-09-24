"""BTC / USDT cycle-harvest simulator. One continuous run; scored per halving cycle.

Books: btc (quantity), usd (USDT), basis (USD cost of the BTC held, average-cost).
Sales reserve tax on the realized gain immediately (the USDT left is what can rebuy).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from rotation.rules.cycle import BuyRules, SellRules, buy_started, clock_tranche_days


@dataclass
class CycleResult:
    daily: pd.DataFrame
    trades: pd.DataFrame
    per_cycle: pd.DataFrame


@dataclass
class _State:
    btc: float
    usd: float = 0.0
    basis: float = 0.0
    stack_ref: float = 0.0  # BTC at the start of this cycle's sell window
    sold_btc: float = 0.0  # sold this cycle
    clock_done: set = field(default_factory=set)
    trend_done: bool = False
    armed_ath: bool = False
    deploy_usd: float = 0.0  # USDT to deploy, fixed when deployment starts
    tranches_done: int = 0
    last_buy: pd.Timestamp | None = None
    cycle: pd.Timestamp | None = None


def run_cycle(
    feats: pd.DataFrame,
    sell: SellRules,
    buy: BuyRules,
    start_btc: float = 11.0,
    fee: float = 0.002,
    tax_rate: float = 0.15,
    start: str | None = None,
) -> CycleResult:
    f = feats.loc[start:] if start else feats
    f = f[f["last_halving"].notna()]
    first = f.iloc[0]
    s = _State(btc=start_btc, basis=start_btc * first["btc"], cycle=first["last_halving"])
    trades, rows = [], []

    def do_sell(t, px, qty, reason):
        qty = min(qty, s.btc)
        if qty <= 0:
            return
        proceeds = qty * px * (1 - fee)
        cost = s.basis * qty / s.btc
        tax = max(proceeds - cost, 0.0) * tax_rate
        s.btc -= qty
        s.basis -= cost
        s.usd += proceeds - tax
        s.sold_btc += qty
        trades.append(
            {
                "date": t,
                "side": "sell",
                "btc": qty,
                "usd": proceeds,
                "tax": tax,
                "px": px,
                "reason": reason,
            }
        )

    def do_buy(t, px, usd, reason):
        usd = min(usd, s.usd)
        if usd <= 0:
            return
        qty = usd * (1 - fee) / px
        s.btc += qty
        s.basis += usd
        s.usd -= usd
        trades.append(
            {
                "date": t,
                "side": "buy",
                "btc": qty,
                "usd": usd,
                "tax": 0.0,
                "px": px,
                "reason": reason,
            }
        )

    for t, row in f.iterrows():
        px = row["btc"]
        if row["last_halving"] != s.cycle:  # new halving: new cycle, fresh sell budget
            s.cycle, s.sold_btc, s.clock_done, s.trend_done = row["last_halving"], 0.0, set(), False
            s.armed_ath, s.stack_ref = False, 0.0
        dsh = row["days_since_halving"]

        # --- sell side -----------------------------------------------------------------
        if sell.window_start_days <= dsh <= sell.window_end_days:
            if s.stack_ref == 0.0:
                s.stack_ref = s.btc
            target = s.stack_ref * sell.target_frac
            per_tranche = target * sell.clock_share / sell.clock_tranches
            for i, day in enumerate(clock_tranche_days(sell)):
                if dsh >= day and i not in s.clock_done:
                    s.clock_done.add(i)
                    do_sell(t, px, per_tranche, f"clock_{i + 1}")
            if row["days_since_ath"] == 0:
                s.armed_ath = True
            armed = s.armed_ath or not sell.trend_needs_new_ath
            if armed and not s.trend_done and row["weekly_below_sma"]:
                s.trend_done = True
                do_sell(t, px, max(target - s.sold_btc, 0.0), "trend_break")

        # --- buy side ------------------------------------------------------------------
        if s.usd > 1.0 and not (sell.window_start_days <= dsh <= sell.window_end_days):
            if s.deploy_usd == 0.0 and buy_started(row, buy):
                s.deploy_usd, s.tranches_done = s.usd, 0
            if row["days_since_ath"] == 0:
                # a new all-time high outside the sell window with USDT still waiting: the
                # bottom was missed; buy back now rather than sit out the next bull
                do_buy(t, px, s.usd, "new_ath_redeploy")
            elif s.deploy_usd > 0:
                due = s.last_buy is None or (t - s.last_buy).days >= buy.spacing_days
                if row["days_since_ath"] >= buy.deadline_days_since_ath:
                    do_buy(t, px, s.usd, "deadline")
                elif due and s.tranches_done < buy.tranches:
                    do_buy(t, px, s.deploy_usd / buy.tranches, f"tranche_{s.tranches_done + 1}")
                    s.tranches_done += 1
                    s.last_buy = t
        if s.usd <= 1.0:
            s.deploy_usd, s.last_buy = 0.0, None

        rows.append(
            {
                "date": t,
                "btc": s.btc,
                "usd": s.usd,
                "px": px,
                "btc_equiv": s.btc + s.usd / px,
                "cycle": s.cycle,
            }
        )

    daily = pd.DataFrame(rows).set_index("date")
    return CycleResult(daily, pd.DataFrame(trades), per_cycle_table(daily))


def per_cycle_table(daily: pd.DataFrame) -> pd.DataFrame:
    """BTC-equivalent at the first day of each cycle vs the first day of the next (or now)."""
    out = []
    starts = daily.groupby("cycle").head(1)
    for i in range(len(starts)):
        a = starts.iloc[i]
        b = starts.iloc[i + 1] if i + 1 < len(starts) else daily.iloc[-1]
        out.append(
            {
                "cycle": a["cycle"].date(),
                "complete": i + 1 < len(starts),
                "btc_start": a["btc_equiv"],
                "btc_end": b["btc_equiv"],
                "multiple": b["btc_equiv"] / a["btc_equiv"],
                "usdt_left_at_end": b["usd"],
            }
        )
    return pd.DataFrame(out).set_index("cycle")
