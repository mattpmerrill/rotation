"""One person's plan -> today's exact actions.

Inputs are what the app stores: the plan (alt budget, sell shares, five coins), current
holdings, and which plan steps this cycle's logged trades already carried out. The BTC
side is the cycle signal (rotation.signal) with the person's sell share; the alt side adds:

  alt_slice_k   halving + slice_days[k]: sell budget/4 BTC, buy the five coins equally
  alt_sell_n    each sell-window clock tranche: sell sell_alt_frac/4 of each coin held when
                the window opened (the last tranche sells whatever is left)

Rebuys use the whole USDT pool (BTC and alt sales together), exactly as the backtest did;
test_person.py replays a full cycle and checks the result against the backtest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pandas as pd

from rotation.config import Cycle
from rotation.rules.cycle import clock_tranche_days, rules_from_config
from rotation.signal import Signal, compute


@dataclass(frozen=True)
class Plan:
    alt_budget_btc: float
    sell_btc_frac: float
    sell_alt_frac: float
    basket: tuple[str, ...]


@dataclass(frozen=True)
class Holdings:
    btc: float
    usdt: float
    alts: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class Done:
    """What this cycle's logged trades already carried out."""

    steps: frozenset[str] = frozenset()
    btc_sold: float = 0.0  # BTC sold on btc_sell_* steps
    alt_sold: dict[str, float] = field(default_factory=dict)  # per coin, on alt_sell_* steps
    rebuys: int = 0  # rebuy_* steps done


@dataclass(frozen=True)
class Step:
    step: str
    kind: str  # "buy" | "sell"
    asset: str  # "bitcoin" or a CoinGecko id
    qty: float | None
    usd: float
    reason: str
    share: str


def with_sell_frac(c: Cycle, frac: float) -> Cycle:
    return c.model_copy(update={"sell": c.sell.model_copy(update={"target_frac": frac})})


def person_steps(
    f: pd.DataFrame,
    c: Cycle,
    day: date,
    plan: Plan,
    hold: Holdings,
    done: Done,
    prices: dict[str, float],  # USD price today per alt
    fee: float,
) -> tuple[Signal, list[Step]]:
    sell, _ = rules_from_config(c)
    sig = compute(
        f,
        with_sell_frac(c, plan.sell_btc_frac),
        day,
        hold.btc,
        hold.usdt,
        done.btc_sold,
        done.rebuys,
    )
    btc_px = sig.price
    steps = [
        Step(a.step, a.kind, "bitcoin", a.btc, a.usd, a.reason, a.share)
        for a in sig.actions
        if a.step not in done.steps
    ]

    h = pd.Timestamp(sig.last_halving)
    window_open = h + pd.Timedelta(days=sell.window_start_days)
    coins = [x for x in plan.basket if x]

    # --- alt buy slices -------------------------------------------------------------
    n_slices = len(c.alts.slice_days)
    if plan.alt_budget_btc > 0 and coins:
        for k, d in enumerate(c.alts.slice_days, 1):
            when = h + pd.Timedelta(days=d)
            step = f"alt_slice_{k}"
            if when.date() <= day < window_open.date() and step not in done.steps:
                btc_amt = plan.alt_budget_btc / n_slices
                steps.append(
                    Step(
                        step,
                        "sell",
                        "bitcoin",
                        btc_amt,
                        btc_amt * btc_px,
                        f"alt slice {k} of {n_slices}: fund it",
                        f"1/{n_slices} of your alt budget",
                    )
                )
                usd_each = btc_amt * btc_px * (1 - fee) / len(coins)
                for coin in coins:
                    px = prices.get(coin)
                    steps.append(
                        Step(
                            step,
                            "buy",
                            coin,
                            usd_each / px if px else None,
                            usd_each,
                            f"alt slice {k} of {n_slices}",
                            f"1/{len(coins)} of the slice",
                        )
                    )

    # --- alt sells in the window ------------------------------------------------------
    sell_days = clock_tranche_days(sell)
    for n, d in enumerate(sell_days, 1):
        when = h + pd.Timedelta(days=d)
        step = f"alt_sell_{n}"
        if not (when.date() <= day and sig.days_since_halving <= sell.window_end_days):
            continue
        if step in done.steps:
            continue
        last = n == len(sell_days)
        for coin, qty in hold.alts.items():
            if qty <= 0:
                continue
            ref = qty + done.alt_sold.get(coin, 0.0)
            q = (
                qty
                if last and plan.sell_alt_frac >= 1
                else min(ref * plan.sell_alt_frac / len(sell_days), qty)
            )
            px = prices.get(coin)
            steps.append(
                Step(
                    step,
                    "sell",
                    coin,
                    q,
                    q * px if px else 0.0,
                    f"sell window, alt tranche {n} of {len(sell_days)}",
                    "all remaining alts"
                    if last
                    else f"1/{len(sell_days)} of each alt you held when the window opened",
                )
            )
    return sig, steps
