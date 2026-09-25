"""The daily job: cycle state for everyone, exact actions for each person, public alert.

  1. BTC price + MVRV (CoinMetrics) -> cycle features -> the shared cycle state
  2. every plan + trade log (Supabase) -> that person's steps for today -> `actions`
  3. the public Discord brief: what is due today, as shares of a stack (never amounts)
  4. today's prices and ranks for the top 250 alts plus every basket/held coin

Reads and writes with the database owner's connection (SUPABASE_DB_URL), which bypasses
RLS by design: this job is the only writer of cycle_state and actions.
"""

from __future__ import annotations

import json
import os
from datetime import date

import pandas as pd

from rotation.config import Config
from rotation.data.universe import is_excluded
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


def rank_markets(markets: pd.DataFrame, excluded: set[str]) -> pd.DataFrame:
    """Rank by market cap the way the backtest did: stablecoins, wrapped coins and BTC
    itself don't take a place. Coins without a market cap get no rank."""
    m = markets[markets["market_cap"].fillna(0) > 0].copy()
    m = m.sort_values("market_cap", ascending=False)
    eligible = ~m["id"].isin(excluded | {"bitcoin"})
    m["rank"] = pd.NA
    m.loc[eligible, "rank"] = range(1, int(eligible.sum()) + 1)
    return pd.concat([m, markets[~markets["id"].isin(m["id"])].assign(rank=pd.NA)])


def refresh_prices(cur, cfg: Config, day: date, wanted: set[str]) -> dict[str, float]:
    """Save today's prices for the top 250 plus every basket/held coin to daily_prices.
    Needs COINGECKO_API_KEY (the free Demo key is enough); without it, returns {}."""
    if not os.environ.get("COINGECKO_API_KEY"):
        return {}
    from rotation.data.coingecko import CoinGecko

    cg = CoinGecko()
    markets = cg.markets()
    cur.execute("select id, is_excluded from public.coins")
    known = dict(cur.fetchall())
    # a coin never seen before: classify it by its CoinGecko categories, like the backtest
    u = cfg.universe
    for r in markets.itertuples():
        if r.id in known or r.id == "bitcoin":
            continue
        cats = cg.coin_categories(r.id)
        excl = is_excluded(r.id, cats, u.exclude_categories, u.exclude_ids, u.force_include_ids)
        cur.execute(
            """insert into public.coins (id, symbol, name, categories, is_excluded)
               values (%s, %s, %s, %s, %s) on conflict (id) do nothing""",
            (r.id, r.symbol, r.name, cats, excl),
        )
        known[r.id] = excl
    excluded = {i for i, x in known.items() if x} | set(u.exclude_ids)
    ranked = rank_markets(markets, excluded)
    prices = dict(zip(ranked["id"], ranked["current_price"].astype(float), strict=True))
    extra = cg.simple_prices(wanted - set(prices))
    prices.update(extra)

    rows = [
        (
            r.id,
            r.symbol,
            r.name,
            r.current_price,
            r.total_volume,
            r.market_cap,
            None if pd.isna(r.rank) else int(r.rank),
        )
        for r in ranked.itertuples()
        if r.id != "bitcoin" and not pd.isna(r.current_price)
    ] + [(cid, cid, cid, px, None, None, None) for cid, px in extra.items()]
    for cid, sym, name, px, vol, mcap, rank in rows:
        # new coins get a row in `coins` first (daily_prices references it)
        cur.execute(
            "insert into public.coins (id, symbol, name) values (%s, %s, %s) on conflict (id) do nothing",
            (cid, sym, name),
        )
        cur.execute(
            """insert into public.daily_prices (coin_id, date, close, volume_usd, market_cap_usd,
                 rank, source) values (%s,%s,%s,%s,%s,%s,'coingecko_live')
               on conflict (coin_id, date) do update set close = excluded.close,
                 volume_usd = excluded.volume_usd, market_cap_usd = excluded.market_cap_usd,
                 rank = excluded.rank, source = excluded.source""",
            (cid, day, px, vol, mcap, rank),
        )
    return prices


def run(cfg: Config, f: pd.DataFrame, day: date, dsn: str) -> tuple[str, int, int]:
    """Write cycle_state + everyone's actions + today's prices for `day`.
    Returns (public brief, people, coins priced)."""
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
        prices = refresh_prices(cur, cfg, day, coins)

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
    return brief, len(plans), len(prices)
