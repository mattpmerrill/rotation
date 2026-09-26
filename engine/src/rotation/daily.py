"""The daily market job: the data the 1 BTC Challenge app reads.

  1. BTC price + MVRV (CoinMetrics) -> cycle features -> today's `market_state` row
     (BTC vs its high, days since the halving, and whether the bear rebuy window is open)
  2. today's prices and ranks for the top 250 alts, BTC, and every coin in an entry's
     basket or held by an entry -> `daily_prices`

This job only writes market data. Everything about people (valuations, the leaderboard,
Discord posts) lives in the web app, so the challenge logic has a single home.

Writes with the database owner's connection (SUPABASE_DB_URL), which bypasses RLS by design:
this job is the only writer of market_state and daily_prices.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date

import httpx
import numpy as np
import pandas as pd

from rotation.config import Config
from rotation.data.universe import is_excluded
from rotation.rules.cycle import buy_started, rules_from_config

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class MarketState:
    day: date
    btc_price: float
    ath: float
    ath_date: date
    drawdown: float
    days_since_ath: int
    mvrv: float | None
    days_since_halving: int
    rebuy_window_open: bool


def market_state(f: pd.DataFrame, cfg: Config, day: date) -> MarketState:
    """Today's row from the cycle features (rotation.rules.cycle.cycle_features)."""
    row = f.loc[pd.Timestamp(day)]
    _, buy = rules_from_config(cfg.rules.cycle)
    days_since_ath = int(row["days_since_ath"])
    return MarketState(
        day=day,
        btc_price=float(row["btc"]),
        ath=float(row["ath"]),
        ath_date=(pd.Timestamp(day) - pd.Timedelta(days=days_since_ath)).date(),
        drawdown=float(row["drawdown"]),
        days_since_ath=days_since_ath,
        mvrv=None if np.isnan(row["mvrv"]) else float(row["mvrv"]),
        days_since_halving=int(row["days_since_halving"]),
        rebuy_window_open=buy_started(row, buy),
    )


def rank_markets(markets: pd.DataFrame, excluded: set[str]) -> pd.DataFrame:
    """Rank by market cap the way the backtest did: stablecoins, wrapped coins and BTC
    itself don't take a place. Coins without a market cap get no rank."""
    m = markets[markets["market_cap"].fillna(0) > 0].copy()
    m = m.sort_values("market_cap", ascending=False)
    eligible = ~m["id"].isin(excluded | {"bitcoin"})
    m["rank"] = pd.NA
    m.loc[eligible, "rank"] = range(1, int(eligible.sum()) + 1)
    return pd.concat([m, markets[~markets["id"].isin(m["id"])].assign(rank=pd.NA)])


def _write_market_state(cur, s: MarketState, config_hash: str) -> None:
    cur.execute(
        """insert into public.market_state (day, btc_price, ath, ath_date, drawdown,
             days_since_ath, mvrv, days_since_halving, rebuy_window_open, config_hash)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict (day) do update set btc_price = excluded.btc_price, ath = excluded.ath,
             ath_date = excluded.ath_date, drawdown = excluded.drawdown,
             days_since_ath = excluded.days_since_ath, mvrv = excluded.mvrv,
             days_since_halving = excluded.days_since_halving,
             rebuy_window_open = excluded.rebuy_window_open, config_hash = excluded.config_hash""",
        (
            s.day,
            s.btc_price,
            s.ath,
            s.ath_date,
            s.drawdown,
            s.days_since_ath,
            s.mvrv,
            s.days_since_halving,
            s.rebuy_window_open,
            config_hash,
        ),
    )


def _coins_in_entries(cur) -> set[str]:
    """Every coin an entry picked or has traded: these get priced even outside the top 250."""
    cur.execute(
        """select unnest(basket) from public.entries
           union select distinct asset from public.entry_trades"""
    )
    return {r[0] for r in cur.fetchall()} - {"bitcoin"}


def classify_new_coins(
    markets: pd.DataFrame, known: dict[str, bool], categories_of, universe
) -> tuple[list[tuple], list[str]]:
    """Coins never seen before, classified by their CoinGecko categories like the backtest.
    Returns (rows for `coins`: id, symbol, name, categories, excluded) and the ids whose
    categories couldn't be fetched. Those are left out for the day (no rank, so an
    unclassified stablecoin can't take a top-100 place) and retried tomorrow."""
    rows, failed = [], []
    for r in markets.itertuples():
        if r.id in known:
            continue
        try:
            cats = [] if r.id == "bitcoin" else categories_of(r.id)
        except httpx.HTTPError:
            failed.append(r.id)
            continue
        excl = is_excluded(
            r.id,
            cats,
            universe.exclude_categories,
            universe.exclude_ids,
            universe.force_include_ids,
        )
        rows.append((r.id, r.symbol, r.name, cats, excl))
    return rows, failed


def refresh_prices(cur, cfg: Config, day: date, wanted: set[str]) -> int:
    """Save today's prices for BTC, the top 250 and every `wanted` coin to daily_prices.
    Needs COINGECKO_API_KEY (the free Demo key is enough); without it, prices nothing."""
    if not os.environ.get("COINGECKO_API_KEY"):
        return 0
    from rotation.data.coingecko import CoinGecko

    cg = CoinGecko()
    markets = cg.markets()
    cur.execute("select id, is_excluded from public.coins")
    known = dict(cur.fetchall())
    u = cfg.universe
    new, unclassified = classify_new_coins(markets, known, cg.coin_categories, u)
    for cid, sym, name, cats, excl in new:
        cur.execute(
            """insert into public.coins (id, symbol, name, categories, is_excluded)
               values (%s, %s, %s, %s, %s) on conflict (id) do nothing""",
            (cid, sym, name, cats, excl),
        )
        known[cid] = excl
    if unclassified:
        log.warning("left out today, CoinGecko didn't classify them: %s", ", ".join(unclassified))
        markets = markets[~markets["id"].isin(unclassified)]
    excluded = {i for i, x in known.items() if x} | set(u.exclude_ids)
    ranked = rank_markets(markets, excluded)
    extra = cg.simple_prices(wanted - set(ranked["id"]))

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
        if not pd.isna(r.current_price)
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
    return len(rows)


def run(cfg: Config, f: pd.DataFrame, today: date, dsn: str) -> tuple[MarketState, int]:
    """Write the latest market_state and today's prices. Returns (market state, coins priced).

    `f` ends at CoinMetrics' latest day (it publishes about a day late); prices are
    CoinGecko's as of now, stored under `today`."""
    import psycopg

    state = market_state(f, cfg, f.index[-1].date())
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        _write_market_state(cur, state, cfg.config_hash)
        priced = refresh_prices(cur, cfg, today, _coins_in_entries(cur))
        conn.commit()
    return state, priced
