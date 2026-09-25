"""The daily job: cycle state for everyone, exact actions for each person, public alert.

  1. BTC price + MVRV (CoinMetrics) -> cycle features -> the shared cycle state
  2. every plan + trade log (Supabase) -> that person's steps for today -> `actions`
  3. the public Discord brief: what is due today, as shares of a stack (never amounts)

Reads and writes with the database owner's connection (SUPABASE_DB_URL), which bypasses
RLS by design: this job is the only writer of cycle_state and actions.
"""

from __future__ import annotations

import json
import os
from datetime import date

import pandas as pd

from rotation.config import Config
from rotation.person import Done, Holdings, Plan, Step, person_steps
from rotation.signal import Signal

# A stand-in person used to word the public brief: shares only, no real holdings.
_GENERIC_PLAN = Plan(alt_budget_btc=1.0, sell_btc_frac=0.5, sell_alt_frac=1.0, basket=("alt",))
# USDT above the signal's $1 threshold, so rebuy steps are announced for people holding USDT.
_GENERIC_HOLD = Holdings(btc=1.0, usdt=1000.0, alts={"alt": 1.0})


def public_steps(f: pd.DataFrame, cfg: Config, day: date) -> tuple[Signal, list[Step]]:
    c = cfg.rules.cycle
    return person_steps(
        f, c, day, _GENERIC_PLAN, _GENERIC_HOLD, Done(), {"alt": 1.0}, c.account.fee_per_trade
    )


def public_brief(sig: Signal, steps: list[Step]) -> str:
    lines = [
        f"**Rotation · BTC cycle · {sig.day:%a %d %b %Y}**",
        (
            f"BTC ${sig.price:,.0f} · {sig.drawdown:.0%} below the ${sig.ath:,.0f} high "
            f"({sig.ath_date:%d %b %Y}) · MVRV {sig.mvrv:.2f}"
        ),
        (
            f"Day {sig.days_since_halving} since the {sig.last_halving:%b %Y} halving · "
            f"next halving ~{sig.next_halving_est:%b %Y} (est.)"
        ),
        f"Phase: **{sig.phase}**",
    ]
    seen, today = set(), []
    for s in steps:
        if s.step in seen:
            continue
        seen.add(s.step)
        if s.step.startswith("alt_slice"):
            today.append(f"• ALT BUY: {s.reason.split(':')[0]}: move {s.share} into your five alts")
        elif s.step.startswith("alt_sell"):
            today.append(f"• ALT SELL: {s.reason}: {s.share}")
        elif s.step.startswith("btc_sell"):
            today.append(f"• BTC SELL: {s.reason}: {s.share}")
        else:
            today.append(f"• BTC BUY (if you hold USDT from the top): {s.reason}: {s.share}")
    lines += ["", "**Due today:**", *today] if today else ["No action today."]
    if sig.upcoming:
        lines += ["", "Coming up:", *[f"• {d:%d %b %Y}: {w}" for d, w in sig.upcoming[:4]]]
    lines += ["", "Your exact amounts are on your plan page."]
    return "\n".join(lines)


def _done_this_cycle(trades: pd.DataFrame, since: date) -> Done:
    t = trades[(trades["traded_on"] >= since) & trades["plan_step"].notna()]
    btc_sells = t[
        (t["asset"] == "bitcoin")
        & (t["side"] == "sell")
        & t["plan_step"].str.startswith("btc_sell")
    ]
    alt_sells = t[
        (t["asset"] != "bitcoin")
        & (t["side"] == "sell")
        & t["plan_step"].str.startswith("alt_sell")
    ]
    rebuys = t[t["plan_step"].str.startswith("rebuy")]["plan_step"].nunique()
    return Done(
        steps=frozenset(t["plan_step"]),
        btc_sold=float(btc_sells["qty"].sum()),
        alt_sold=alt_sells.groupby("asset")["qty"].sum().astype(float).to_dict(),
        rebuys=int(rebuys),
    )


def _frame(cur, sql: str) -> pd.DataFrame:
    cur.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])


def alt_prices(coins: set[str]) -> dict[str, float]:
    """Today's USD prices from CoinGecko (free Demo key is enough). Missing -> omitted."""
    if not coins or not os.environ.get("COINGECKO_API_KEY"):
        return {}
    from rotation.data.coingecko import CoinGecko

    body = CoinGecko()._get(
        "/simple/price", {"ids": ",".join(sorted(coins)), "vs_currencies": "usd"}
    )
    return {k: float(v["usd"]) for k, v in (body or {}).items() if "usd" in v}


def run(cfg: Config, f: pd.DataFrame, day: date, dsn: str) -> tuple[str, int]:
    """Write cycle_state + everyone's actions for `day`. Returns (public brief, people)."""
    import psycopg

    c = cfg.rules.cycle
    sig, pub = public_steps(f, cfg, day)
    brief = public_brief(sig, pub)
    upcoming = [{"date": d.isoformat(), "what": w} for d, w in sig.upcoming]

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """insert into public.cycle_state (day, btc_price, ath, ath_date, drawdown,
                 days_since_ath, mvrv, last_halving, days_since_halving, next_halving_est,
                 phase, upcoming, config_hash)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               on conflict (day) do update set btc_price = excluded.btc_price, ath = excluded.ath,
                 ath_date = excluded.ath_date, drawdown = excluded.drawdown,
                 days_since_ath = excluded.days_since_ath, mvrv = excluded.mvrv,
                 last_halving = excluded.last_halving,
                 days_since_halving = excluded.days_since_halving,
                 next_halving_est = excluded.next_halving_est, phase = excluded.phase,
                 upcoming = excluded.upcoming, config_hash = excluded.config_hash""",
            (
                day,
                sig.price,
                sig.ath,
                sig.ath_date,
                sig.drawdown,
                sig.days_since_ath,
                None if pd.isna(sig.mvrv) else float(sig.mvrv),
                sig.last_halving,
                sig.days_since_halving,
                sig.next_halving_est,
                sig.phase,
                json.dumps(upcoming),
                cfg.config_hash,
            ),
        )
        plans = _frame(cur, "select * from public.plans")
        trades = _frame(cur, "select * from public.trades")
        holdings = _frame(cur, "select * from public.holdings")
        coins = {x for b in plans["basket"] for x in (b or [])} | set(
            holdings.loc[~holdings["asset"].isin(["bitcoin", "usdt"]), "asset"]
        )
        prices = alt_prices(coins)

        cur.execute("delete from public.actions where day = %s", (day,))
        for p in plans.itertuples():
            h = holdings[holdings["user_id"] == p.user_id].set_index("asset")["qty"].astype(float)
            hold = Holdings(
                btc=float(h.get("bitcoin", 0.0)),
                usdt=float(h.get("usdt", 0.0)),
                alts={a: q for a, q in h.items() if a not in ("bitcoin", "usdt")},
            )
            mine = trades[trades["user_id"] == p.user_id]
            done = _done_this_cycle(mine, sig.last_halving)
            plan = Plan(
                float(p.alt_budget_btc),
                float(p.sell_btc_frac),
                float(p.sell_alt_frac),
                tuple(p.basket or ()),
            )
            _, steps = person_steps(f, c, day, plan, hold, done, prices, c.account.fee_per_trade)
            for s in steps:
                cur.execute(
                    """insert into public.actions (user_id, day, kind, asset, qty, usd, plan_step,
                         reason, share) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       on conflict (user_id, day, plan_step, asset) do update
                         set qty = excluded.qty, usd = excluded.usd, reason = excluded.reason""",
                    (p.user_id, day, s.kind, s.asset, s.qty, s.usd, s.step, s.reason, s.share),
                )
        conn.commit()
    return brief, len(plans)
