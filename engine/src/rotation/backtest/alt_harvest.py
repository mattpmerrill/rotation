"""Alt harvest (Matt, 2026-09-25): use a small alt basket to buy more BTC through the bull.

Per cycle, starting at the halving with 1 BTC:
  1. Put the 1 BTC into an equal-weight alt basket.
  2. Each time an alt rises `trigger` above its reference price, sell `sell_frac` of that
     position into USDT; the reference resets to that price.
     basis "usd": measured in dollars. basis "btc": measured against BTC (ALT/BTC).
  3. When BTC pulls back `pullback` from its high since the USDT arrived, the USDT buys BTC.
  4. In the cycle-harvest sell window: sell the remaining alts in the 4 clock tranches, and
     sell `btc_target` of the BTC accumulated. Everything waits in USDT for the bottom and is
     redeployed by the cycle-harvest buy rules.
  Scored at the next halving (or today) in BTC, against 1 BTC held and 1 BTC under cycle
  harvest alone (the fair benchmark: that part happens either way).
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
import pandas as pd

from rotation.rules.cycle import BuyRules, SellRules, buy_started, clock_tranche_days

MATT_BASKET = ["ethereum", "binancecoin", "ripple", "solana", "chainlink"]


@dataclass(frozen=True)
class AltRules:
    trigger: float = 0.25
    sell_frac: float = 0.25
    pullback: float = 0.10
    basis: str = "usd"  # "usd" | "btc"
    btc_target: float = 0.5


def simulate(
    cf: pd.DataFrame,  # cycle features (btc, days_since_halving, last_halving, ...)
    alt_px: pd.DataFrame,  # wide: date x coin, USD close
    coins: list[str],
    start: pd.Timestamp,
    end: pd.Timestamp,
    a: AltRules,
    sell: SellRules,
    buy: BuyRules,
    fee: float,
    start_btc: float = 1.0,
) -> pd.DataFrame:
    days = cf.loc[start:end]
    px0 = alt_px.loc[start]
    coins = [c for c in coins if c in alt_px.columns and not np.isnan(px0.get(c, np.nan))]
    each = start_btc * days.iloc[0]["btc"] * (1 - fee) / len(coins)
    qty = {c: each / px0[c] for c in coins}
    ref = {c: px0[c] / (days.iloc[0]["btc"] if a.basis == "btc" else 1.0) for c in coins}
    btc, usdt = 0.0, 0.0
    usdt_btc_high = None  # BTC's high since USDT arrived (for the pullback deploy)
    stack_ref, alt_ref, sold_btc = None, None, 0.0
    tranche_days = clock_tranche_days(sell)
    done_tranches: set[int] = set()
    deploy_usd, tranches_done, last_buy = 0.0, 0, None
    rows = []
    for t, row in days.iterrows():
        b = row["btc"]
        dsh = row["days_since_halving"]
        in_window = sell.window_start_days <= dsh <= sell.window_end_days
        prices = alt_px.loc[t] if t in alt_px.index else None

        if not in_window and stack_ref is None and prices is not None:
            # --- bull phase: harvest alt gains into USDT, USDT into BTC on pullbacks ---
            for c in coins:
                p = prices.get(c, np.nan)
                if np.isnan(p) or qty[c] <= 0:
                    continue
                level = p / b if a.basis == "btc" else p
                if level >= ref[c] * (1 + a.trigger):
                    q = qty[c] * a.sell_frac
                    qty[c] -= q
                    usdt += q * p * (1 - fee)
                    ref[c] = level
                    usdt_btc_high = b if usdt_btc_high is None else max(usdt_btc_high, b)
            if usdt > 0:
                usdt_btc_high = max(usdt_btc_high or b, b)
                if b <= usdt_btc_high * (1 - a.pullback):
                    btc += usdt * (1 - fee) / b
                    usdt, usdt_btc_high = 0.0, None

        if in_window:
            # --- top: sell the remaining alts and btc_target of the BTC, in clock tranches ---
            if stack_ref is None:
                stack_ref = btc
                alt_ref = dict(qty)
                if usdt > 0:  # USDT still waiting for a pullback now waits for the bottom
                    usdt_btc_high = None
            for i, d in enumerate(tranche_days):
                if dsh >= d and i not in done_tranches:
                    done_tranches.add(i)
                    q_btc = min(stack_ref * a.btc_target / len(tranche_days), btc)
                    btc -= q_btc
                    sold_btc += q_btc
                    usdt += q_btc * b * (1 - fee)
                    last = i == len(tranche_days) - 1
                    for c in coins:
                        p = prices.get(c, np.nan) if prices is not None else np.nan
                        if np.isnan(p):
                            continue
                        q = qty[c] if last else min(alt_ref[c] / len(tranche_days), qty[c])
                        qty[c] -= q
                        usdt += q * p * (1 - fee)
        elif stack_ref is not None and usdt > 1:
            # --- bear: cycle-harvest buy rules ---
            if row["days_since_ath"] == 0 or row["days_since_ath"] >= buy.deadline_days_since_ath:
                btc += usdt * (1 - fee) / b
                usdt = 0.0
            else:
                if deploy_usd == 0.0 and buy_started(row, buy):
                    deploy_usd, tranches_done = usdt, 0
                due = last_buy is None or (t - last_buy).days >= buy.spacing_days
                if deploy_usd > 0 and due and tranches_done < buy.tranches:
                    amt = min(deploy_usd / buy.tranches, usdt)
                    btc += amt * (1 - fee) / b
                    usdt -= amt
                    tranches_done += 1
                    last_buy = t

        # a dead coin (no price) is worth 0 on its own; it must not zero the rest
        alts_usd = float(
            np.nansum(
                [
                    qty[c] * (prices.get(c, np.nan) if prices is not None else np.nan)
                    for c in coins
                    if qty[c] > 0
                ]
            )
        )
        rows.append(
            {
                "date": t,
                "btc": btc,
                "usdt": usdt,
                "alts_usd": alts_usd,
                "btc_equiv": btc + (usdt + alts_usd) / b,
            }
        )
    return pd.DataFrame(rows).set_index("date")


def grid(
    cf,
    alt_px,
    coins_by_cycle: dict,
    sell: SellRules,
    buy: BuyRules,
    fee: float,
    cycles: dict[str, tuple[pd.Timestamp, pd.Timestamp]],
) -> pd.DataFrame:
    rows = []
    for trigger, frac, pull, basis in itertools.product(
        [0.15, 0.25, 0.50, 0.75, 1.00],
        [0.0, 0.10, 0.20, 0.25, 0.33, 0.50],
        [0.05, 0.10, 0.15, 0.20],
        ["usd", "btc"],
    ):
        a = AltRules(trigger, frac, pull, basis)
        if frac == 0.0 and (trigger, pull, basis) != (1.0, 0.10, "usd"):
            continue  # "never sell until the top" is one strategy, not a grid of them
        for name, (s, e) in cycles.items():
            for basket, coins in coins_by_cycle[name].items():
                d = simulate(cf, alt_px, coins, s, e, a, sell, buy, fee)
                w = s + pd.Timedelta(days=sell.window_start_days - 1)
                rows.append(
                    {
                        "cycle": name,
                        "basket": basket,
                        "trigger": trigger,
                        "sell_frac": frac,
                        "pullback": pull,
                        "basis": basis,
                        "at_window": d.loc[:w, "btc_equiv"].iloc[-1],
                        "btc_end": d["btc_equiv"].iloc[-1],
                    }
                )
    return pd.DataFrame(rows)
