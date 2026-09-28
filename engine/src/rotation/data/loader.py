"""Parquet cache -> Supabase Postgres (tables in supabase/migrations).

The database holds what the dashboard and bot read; backtests stay on Parquet.
By default only the last 400 days of alt prices are loaded (enough for the 200D and
365D indicators); BTC on-chain history is loaded in full. Idempotent: every table is
upserted on its primary key.

Connection: SUPABASE_DB_URL in .env (the direct Postgres URL, service role).
"""

from __future__ import annotations

import io
import json
import os
import re
from collections.abc import Iterable

import pandas as pd

from rotation.config import Config
from rotation.data import cache


def prepare(cfg: Config, since: str) -> dict[str, pd.DataFrame]:
    """Build every table's rows from the cache. Pure apart from cache reads."""
    ranks = cache.read("universe", "ranks")
    px = cache.read("universe", "prices")
    fmap = cache.read("universe", "futures_map")
    funding = cache.read("universe", "funding")
    oi = cache.read_if_exists("universe", "open_interest")
    onchain = cache.read("coinmetrics", "btc")
    cats = cache.read("coingecko_meta", "categories")
    meta = pd.read_parquet(cache.data_dir() / "coingecko_backfill" / "_coins.parquet")

    # ranked coins, plus every coin the backtest excluded (stables, wrapped, tokenized...) so
    # the daily job knows they are excluded when they show up in today's market list
    audit = cache.data_dir() / "universe" / "excluded_audit.csv"
    excluded_ids = set(pd.read_csv(audit)["coin_id"]) if audit.exists() else set()
    coin_ids = set(ranks["coin_id"]) | {"bitcoin"} | excluded_ids
    u = cfg.universe
    excl = {c.casefold() for c in u.exclude_categories}
    memes = {c.casefold() for c in u.meme_categories}
    cat_map = dict(zip(cats["coin_id"], cats["categories"], strict=True))
    m = meta[meta["id"].isin(coin_ids)]
    coins = pd.DataFrame(
        {
            "id": m["id"],
            "symbol": m["symbol"],
            "name": m["name"],
            "categories": [list(cat_map.get(i, [])) for i in m["id"]],
        }
    )
    coins["is_excluded"] = [
        i in u.exclude_ids or i in excluded_ids or any(c.strip().casefold() in excl for c in cs)
        for i, cs in zip(coins["id"], coins["categories"], strict=True)
    ]
    coins["is_meme"] = [
        i in u.meme_ids or any(c.strip().casefold() in memes for c in cs)
        for i, cs in zip(coins["id"], coins["categories"], strict=True)
    ]

    p = px[(px["date"] >= since) & px["coin_id"].isin(coin_ids)]
    daily = p.merge(
        ranks[["coin_id", "date", "rank", "market_cap_usd", "volume_usd"]],
        on=["coin_id", "date"],
        how="left",
    )
    daily = daily.rename(columns={"price_usd": "close"})[
        ["coin_id", "date", "close", "volume_usd", "market_cap_usd", "rank", "source"]
    ]
    daily["rank"] = daily["rank"].astype("Int64")  # integer column: "5.0" would fail COPY

    d = funding[funding["date"] >= since]
    if oi is not None:
        d = d.merge(oi[oi["date"] >= since], on=["coin_id", "date"], how="outer")
    else:
        d = d.assign(oi_usd=float("nan"))
    derivs = d.assign(source="binance")[["coin_id", "date", "funding_8h", "oi_usd", "source"]]

    symbols = pd.DataFrame(
        {
            "exchange": "binance-usdm",
            "symbol": fmap["symbol"],
            "coin_id": fmap["coin_id"],
            "valid_from": pd.to_datetime(fmap["first_month"] + "-01"),
            "valid_to": pd.NaT,
        }
    )

    btc = onchain[["date", "market_cap_usd", "realized_cap_usd", "mvrv"]]

    config_row = pd.DataFrame(
        [
            {
                "hash": cfg.config_hash,
                "version": cfg.rules.version,
                "rules": json.dumps(cfg.rules.model_dump(mode="json")),
                "universe": json.dumps(cfg.universe.model_dump(mode="json")),
            }
        ]
    )
    return {
        "coins": coins,
        "exchange_symbols": symbols[symbols["coin_id"].isin(coin_ids)],
        "daily_prices": daily,
        "derivatives_daily": derivs[derivs["coin_id"].isin(coin_ids)],
        "btc_onchain": btc,
        "config_versions": config_row,
    }


KEYS = {
    "coins": ["id"],
    "exchange_symbols": ["exchange", "symbol", "valid_from"],
    "daily_prices": ["coin_id", "date"],
    "derivatives_daily": ["coin_id", "date"],
    "btc_onchain": ["date"],
    "config_versions": ["hash"],
}


def _pg_array(v: Iterable[object]) -> str:
    return "{" + ",".join('"' + str(x).replace('"', '\\"') + '"' for x in v) + "}"


def normalize_dsn(dsn: str) -> str:
    """Percent-encode the password so a URL pasted from the dashboard works even when the
    password contains '@', ':' or '/'. The password runs to the LAST '@'."""
    from urllib.parse import quote, unquote

    m = re.match(r"^(postgres(?:ql)?://)([^:/@]+):(.*)@([^@]+)$", dsn)
    if not m:
        return dsn
    scheme, user, pw, rest = m.groups()
    return f"{scheme}{user}:{quote(unquote(pw), safe='')}@{rest}"


def load(tables: dict[str, pd.DataFrame], dsn: str | None = None) -> dict[str, int]:
    """COPY each frame into a temp table, then INSERT ... ON CONFLICT DO UPDATE."""
    import psycopg

    dsn = dsn or os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        raise RuntimeError("SUPABASE_DB_URL is not set (see .env.example)")
    dsn = normalize_dsn(dsn)
    counts = {}
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        for name, df in tables.items():  # dict order = FK order (coins first)
            df = df.copy()
            if "categories" in df:
                df["categories"] = df["categories"].map(_pg_array)
            cols = list(df.columns)
            cur.execute(
                f"create temp table _stage (like public.{name} including defaults) on commit drop"
            )
            buf = io.StringIO()
            df.to_csv(buf, index=False, header=False, na_rep="\\N")
            buf.seek(0)
            with cur.copy(
                f"copy _stage ({', '.join(cols)}) from stdin with (format csv, null '\\N')"
            ) as cp:
                cp.write(buf.read())
            keys = KEYS[name]
            updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in keys)
            cur.execute(
                f"insert into public.{name} ({', '.join(cols)}) "
                f"select {', '.join(cols)} from _stage "
                f"on conflict ({', '.join(keys)}) do "
                + (f"update set {updates}" if updates else "nothing")
            )
            counts[name] = len(df)
            cur.execute("drop table _stage")
        conn.commit()
    return counts
