"""Today's cycle-harvest signal: what the rules say to do, and what is coming next.

Stateless: the caller passes current holdings plus what has already been done this cycle
(BTC sold, buy tranches done), so it runs anywhere (laptop, GitHub Actions) and is exact.
Every number comes from the same rule functions the backtest used (rules/cycle.py).

Privacy (Matt, 2026-09-24): the public message never shows holdings or amounts, only the
share of a stack to act on, so the channel can't infer anyone's BTC. Exact amounts are only
in the private rendering.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from fractions import Fraction

import pandas as pd

from rotation.config import Cycle
from rotation.rules.cycle import buy_started, clock_tranche_days, rules_from_config

HALVING_INTERVAL_DAYS = 1456  # ~210,000 blocks at 10 min; real intervals ran 1,319-1,461 days


@dataclass
class Action:
    kind: str  # "sell" | "buy"
    btc: float = 0.0
    usd: float = 0.0
    reason: str = ""
    share: str = ""  # public wording: how much to act on, as a share (never an amount)


@dataclass
class Signal:
    day: date
    price: float
    ath: float
    ath_date: date
    drawdown: float
    days_since_ath: int
    mvrv: float
    last_halving: date
    days_since_halving: int
    next_halving_est: date
    phase: str
    actions: list[Action] = field(default_factory=list)
    upcoming: list[tuple[date, str]] = field(default_factory=list)


def _frac(x: float) -> str:
    """0.083325 -> '1/12'."""
    f = Fraction(x).limit_denominator(100)
    return f"{f.numerator}/{f.denominator}" if f.denominator != 1 else str(f.numerator)


def compute(
    f: pd.DataFrame,
    c: Cycle,
    day: date,
    btc: float,
    usdt: float,
    sold_this_cycle: float = 0.0,
    buy_tranches_done: int = 0,
) -> Signal:
    """f: cycle_features up to at least `day`. Holdings are as of the start of `day`."""
    sell, buy = rules_from_config(c)
    t = pd.Timestamp(day)
    f = f.loc[:t]
    row = f.iloc[-1]
    h = row["last_halving"]
    dsh = int(row["days_since_halving"])
    in_window = sell.window_start_days <= dsh <= sell.window_end_days
    ath_date = (t - pd.Timedelta(days=int(row["days_since_ath"]))).date()
    sig = Signal(
        day=day,
        price=row["btc"],
        ath=row["ath"],
        ath_date=ath_date,
        drawdown=row["drawdown"],
        days_since_ath=int(row["days_since_ath"]),
        mvrv=row["mvrv"],
        last_halving=h.date(),
        days_since_halving=dsh,
        next_halving_est=(h + pd.Timedelta(days=HALVING_INTERVAL_DAYS)).date(),
        phase="",
    )

    # --- sell side ---------------------------------------------------------------------
    target = (btc + sold_this_cycle) * sell.target_frac
    per = target * sell.clock_share / sell.clock_tranches
    clock_dates = [(h + pd.Timedelta(days=d)).date() for d in clock_tranche_days(sell)]
    if in_window:
        sig.phase = "SELL WINDOW"
        planned = per * sum(1 for d in clock_dates if d <= day)
        armed = (
            f.loc[h + pd.Timedelta(days=sell.window_start_days) :, "days_since_ath"] == 0
        ).any()
        if armed and row["weekly_below_sma"]:
            planned = target  # trend broke after a new high: finish the target now
        due = min(max(planned - sold_this_cycle, 0.0), max(target - sold_this_cycle, 0.0))
        if due > 1e-8:
            n = sum(1 for d in clock_dates if d <= day)
            stack = btc + sold_this_cycle
            if planned == target and n < sell.clock_tranches:
                why, share = (
                    "trend broke after a new high",
                    (f"the rest of your {_frac(sell.target_frac)} target"),
                )
            else:
                why = f"clock tranche {n} of {sell.clock_tranches}"
                share = f"{_frac(due / stack)} of the BTC you held when the window opened"
            sig.actions.append(
                Action("sell", btc=due, usd=due * sig.price, reason=why, share=share)
            )
        tranche_frac = _frac(sell.target_frac * sell.clock_share / sell.clock_tranches)
        for d in clock_dates:
            if d > day:
                sig.upcoming.append((d, f"sell tranche ({tranche_frac} of your stack)"))
    elif dsh < sell.window_start_days:
        sig.phase = "HOLD (before the sell window)"
        sig.upcoming.append(
            (
                clock_dates[0],
                (
                    f"sell window opens: {sell.clock_tranches} tranches, "
                    f"{_frac(sell.target_frac)} of your stack in total"
                ),
            )
        )
    else:
        sig.phase = "WAITING FOR THE BOTTOM" if usdt > 1 else "HOLD (after the sell window)"
        nxt = (h + pd.Timedelta(days=HALVING_INTERVAL_DAYS + sell.window_start_days)).date()
        sig.upcoming.append((nxt, "next sell window opens (estimated from the next halving)"))

    # --- buy side ----------------------------------------------------------------------
    if usdt > 1 and not in_window:
        if row["days_since_ath"] == 0:
            sig.phase = "REDEPLOY"
            sig.actions.append(
                Action(
                    "buy",
                    usd=usdt,
                    btc=usdt / sig.price,
                    reason="new all-time high: the bottom was missed, buy back now",
                    share="all of your USDT reserve",
                )
            )
        elif row["days_since_ath"] >= buy.deadline_days_since_ath:
            sig.phase = "REDEPLOY"
            sig.actions.append(
                Action(
                    "buy",
                    usd=usdt,
                    btc=usdt / sig.price,
                    reason=f"deadline: {buy.deadline_days_since_ath} days since the high",
                    share="all of your remaining USDT reserve",
                )
            )
        else:
            since_ath = f.loc[pd.Timestamp(ath_date) :]
            started = since_ath.apply(lambda r: buy_started(r, buy), axis=1)
            if started.any():
                start = started.idxmax().date()
                dates = [start + timedelta(days=buy.spacing_days * k) for k in range(buy.tranches)]
                sig.phase = "BUYING"
                due_n = sum(1 for d in dates if d <= day)
                if due_n > buy_tranches_done and buy_tranches_done < buy.tranches:
                    left = buy.tranches - buy_tranches_done
                    amount = usdt / left
                    sig.actions.append(
                        Action(
                            "buy",
                            usd=amount,
                            btc=amount / sig.price,
                            reason=f"tranche {buy_tranches_done + 1} of {buy.tranches}",
                            share="all of your remaining USDT reserve"
                            if left == 1
                            else f"1/{left} of your remaining USDT reserve",
                        )
                    )
                for d in dates:
                    if d > day:
                        sig.upcoming.append((d, "buy tranche"))
            else:
                first = pd.Timestamp(ath_date) + pd.Timedelta(days=buy.start_days_since_ath)
                sig.upcoming.append(
                    (
                        first.date(),
                        (
                            f"buying starts at the latest ({buy.start_days_since_ath} days "
                            f"after the high), sooner if BTC is "
                            f"{buy.start_drawdown:.0%} down or MVRV < {buy.start_mvrv_below:g}"
                        ),
                    )
                )
    sig.upcoming.sort()
    return sig


def live_features(c: Cycle) -> pd.DataFrame:
    """Fresh BTC price + MVRV from CoinMetrics (free, no key) -> cycle features."""
    from rotation.data import coinmetrics, http
    from rotation.rules.cycle import cycle_features

    with http.client() as client:
        px = coinmetrics.fetch_prices(client, ["btc"], start="2010-07-18")
        onchain = coinmetrics.fetch_btc_onchain(client)
    btc = px.set_index("date")["price_usd"].sort_index()
    mvrv = onchain.set_index("date")["mvrv"]
    halvings = [pd.Timestamp(h) for h in c.halvings]
    return cycle_features(btc, mvrv, halvings, c.sell.trend_weekly_sma)


def render(sig: Signal, btc: float, usdt: float, private: bool = False) -> str:
    """Plain-text message. Public (default): no holdings, no amounts. Private: both."""
    lines = [
        f"**Rotation · BTC cycle harvest · {sig.day:%a %d %b %Y}**",
        (
            f"BTC ${sig.price:,.0f} · {sig.drawdown:.0%} below the ${sig.ath:,.0f} high ({sig.ath_date:%d %b %Y}, "
            f"{sig.days_since_ath} days ago) · MVRV {sig.mvrv:.2f}"
        ),
        f"Day {sig.days_since_halving} since the {sig.last_halving:%b %Y} halving · next halving ~{sig.next_halving_est:%b %Y} (est.)",
        f"Phase: **{sig.phase}**",
    ]
    if private:
        lines.insert(
            3,
            f"Holdings: {btc:.4f} BTC + ${usdt:,.0f} USDT = "
            f"{btc + usdt / sig.price:.4f} BTC equivalent",
        )
    if sig.actions:
        lines.append("")
        lines.append("**Action today:**")
        for a in sig.actions:
            verb = "SELL" if a.kind == "sell" else "BUY"
            if private:
                lines.append(f"• {verb} {a.btc:.4f} BTC (~${a.usd:,.0f}): {a.reason}")
            else:
                lines.append(f"• {verb} {a.share}: {a.reason}")
    else:
        lines.append("No action today.")
    if sig.upcoming:
        lines.append("")
        lines.append("Coming up:")
        lines.extend(f"• {d:%d %b %Y}: {what}" for d, what in sig.upcoming[:4])
    return "\n".join(lines)


def post_discord(text: str, webhook_url: str) -> None:
    import httpx

    r = httpx.post(webhook_url, json={"content": text[:1990]}, timeout=30)
    r.raise_for_status()
