"""Builds supabase/seed.sql: a demo challenge for the local stack, never for production.

What it writes
  - real public market data: daily closes and ranks from the engine's research cache, coin names and
    icon URLs from CoinGecko (supabase/seed/coin-meta.json), and BTC's cycle state computed with the
    engine's own functions
  - invented people: Ava, Ben, Cal, Dee, Eli, Sam and Fay, with invented baskets and trades priced at
    the real closes of the day each one happened. Nothing here comes from production.

Run it from the repo root (needs the engine's uv environment and the research cache):

    ROTATION_DATA_DIR=~/Work/rotation/data uv run --project engine python supabase/seed/build_seed.py

Add --refresh-meta first to re-download coin names and icons (one public CoinGecko call).
The output is deterministic: the same cache gives the same seed.sql, byte for byte.
"""

from __future__ import annotations

import json
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from math import floor, log10
from pathlib import Path

import pandas as pd

from rotation.config import get_config
from rotation.data import cache
from rotation.data.cache import data_dir
from rotation.rules.cycle import cycle_features
from rotation.daily import market_state

ROOT = Path(__file__).resolve().parents[2]
META = ROOT / "supabase" / "seed" / "coin-meta.json"
OUT = ROOT / "supabase" / "seed.sql"

# The last day every source has prices for. "Today" in the demo.
AS_OF = date(2026, 9, 22)
CHALLENGE_OPENED = date(2026, 7, 1)
FEE = 0.01
PASSWORD = "rotation-demo-2026"
SALT = "$2a$10$rotationdemosaltabcdef"  # 22 characters after the cost: a fixed salt keeps the file deterministic
NAMESPACE = uuid.UUID("7d1e1c9e-5a55-4b6e-9a43-0b17c0de0001")

BTC = "bitcoin"


# --- the demo people and what they did --------------------------------------------------------------------


@dataclass
class Move:
    day: date
    kind: str  # fill | sell | rebuy
    coin: str | None = None  # fill / sell
    fraction: float = 1.0  # sell: share of the holding


@dataclass
class Person:
    name: str
    admin: bool = False
    member: bool = True
    joined: str = "2026-07-01"
    # an entry, if they have one
    started: date | None = None
    btc_in: float = 1.0
    basket: list[str] = field(default_factory=list)
    slots: int = 0
    moves: list[Move] = field(default_factory=list)


D = date
PEOPLE = [
    Person("Ava", joined="2026-07-01", started=D(2026, 7, 6), btc_in=1.0,
           basket=["ethereum", "solana", "chainlink", "hyperliquid", "aave"]),
    Person("Ben", joined="2026-07-02", started=D(2026, 7, 9), btc_in=0.75,
           basket=["ripple", "near", "sui", "uniswap"], slots=1),
    Person("Cal", joined="2026-07-02", started=D(2026, 7, 7), btc_in=1.0,
           basket=["dogecoin", "avalanche-2", "litecoin"], slots=2,
           moves=[Move(D(2026, 8, 14), "fill", "bittensor"),
                  Move(D(2026, 9, 18), "sell", "avalanche-2"),
                  Move(D(2026, 9, 18), "sell", "litecoin", 0.5)]),
    Person("Dee", joined="2026-07-03", started=D(2026, 7, 12), btc_in=0.5,
           basket=["binancecoin", "tron", "cardano", "polkadot", "the-open-network", "stellar"],
           moves=[Move(D(2026, 9, 4), "sell", "binancecoin"), Move(D(2026, 9, 4), "sell", "tron"),
                  Move(D(2026, 9, 4), "sell", "cardano"), Move(D(2026, 9, 8), "sell", "polkadot"),
                  Move(D(2026, 9, 8), "sell", "the-open-network"), Move(D(2026, 9, 8), "sell", "stellar"),
                  Move(D(2026, 9, 10), "rebuy")]),
    Person("Sam", admin=True, joined="2026-06-28", started=D(2026, 7, 14), btc_in=1.0,
           basket=["bitcoin-cash", "hedera-hashgraph", "stellar"],
           moves=[Move(D(2026, 9, 20), "sell", "bitcoin-cash"), Move(D(2026, 9, 20), "sell", "hedera-hashgraph"),
                  Move(D(2026, 9, 21), "sell", "stellar")]),
    Person("Eli", joined="2026-07-20"),  # a member with no basket yet: the picker's screenshot
    Person("Fay", member=False, joined="2026-09-21"),  # waiting for approval
]


# --- helpers ---------------------------------------------------------------------------------------------


def uid(name: str) -> str:
    return str(uuid.uuid5(NAMESPACE, name))


def email(name: str) -> str:
    return f"{name.lower()}@example.test"


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def num(x: float | None) -> str:
    return "null" if x is None or pd.isna(x) else repr(float(x))


def sig(x: float, digits: int = 10) -> float:
    """Round to `digits` significant figures, so quantities read like real ones."""
    if x == 0:
        return 0.0
    return round(x, digits - 1 - floor(log10(abs(x))))


def floor_dp(x: float, dp: int) -> float:
    return floor(x * 10**dp) / 10**dp


# --- market data -----------------------------------------------------------------------------------------


def load_market() -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    prices = cache.read("universe", "prices")
    ranks = cache.read("universe", "ranks")
    cm = cache.read("coinmetrics", "prices")
    onchain = cache.read("coinmetrics", "btc")
    prices = prices[prices["date"] <= pd.Timestamp(AS_OF)]
    btc = cm[cm["asset"] == "btc"].set_index("date")["price_usd"].sort_index()
    mvrv = onchain.set_index("date")["mvrv"]
    return prices, ranks, btc, mvrv


def refresh_meta() -> None:
    import httpx

    r = httpx.get(
        "https://api.coingecko.com/api/v3/coins/markets",
        params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 250, "page": 1},
        timeout=30,
    )
    r.raise_for_status()
    meta = {c["id"]: {"symbol": c["symbol"], "name": c["name"], "image": c["image"]} for c in r.json()}
    META.write_text(json.dumps(meta, indent=1, sort_keys=True) + "\n")
    print(f"wrote {META} ({len(meta)} coins)")


def main() -> None:
    if "--refresh-meta" in sys.argv:
        refresh_meta()
    meta = json.loads(META.read_text())
    prices, ranks, btc, mvrv = load_market()

    web = ROOT / "web"
    timing = json.loads((web / "public/data/buy-timing.json").read_text())
    history = json.loads((web / "public/data/basket-history.json").read_text())
    picks_src = (web / "src/features/picks/picks.ts").read_text()

    used = {c for p in PEOPLE for c in p.basket} | {m.coin for p in PEOPLE for m in p.moves if m.coin}
    top = ranks[(ranks["date"] == pd.Timestamp(AS_OF)) & (ranks["rank"] <= 100)]
    top_ids = list(top.sort_values("rank")["coin_id"])
    coin_ids = sorted({BTC, "render-token", *timing["coins"], *history["coins"], *top_ids, *used})

    # the list of coins the app can name and show an icon for
    names = cache.read("coingecko_backfill", "_coins").set_index("id")[["symbol", "name"]]
    coin_rows = []
    for cid in coin_ids:
        m = meta.get(cid)
        if m is None:
            if cid not in names.index:
                raise SystemExit(f"no name for {cid}: run with --refresh-meta or extend coin-meta.json")
            m = {"symbol": str(names.loc[cid, "symbol"]), "name": str(names.loc[cid, "name"]), "image": None}
        coin_rows.append((cid, m["symbol"], m["name"], m["image"]))
    if not all(slug in picks_src for slug in ("solana", "hyperliquid")):  # sanity: the picks file still names coins
        raise SystemExit("picks.ts no longer looks like it did; check the coin list above")

    # --- daily_prices -------------------------------------------------------------------------------------
    by_coin = {cid: g.drop_duplicates("date", keep="last").set_index("date")["price_usd"].sort_index()
               for cid, g in prices[prices["coin_id"].isin(coin_ids)].groupby("coin_id")}
    by_coin[BTC] = btc[btc.index <= pd.Timestamp(AS_OF)]

    def close(cid: str, day: date) -> float:
        s = by_coin[cid]
        s = s[s.index <= pd.Timestamp(day)]
        if s.empty:
            raise SystemExit(f"no price for {cid} on or before {day}")
        return float(s.iloc[-1])

    rank_at = ranks[ranks["date"] >= pd.Timestamp("2026-08-10")].set_index(["coin_id", "date"])
    price_rows: dict[tuple[str, date], tuple] = {}

    def add_price(cid: str, day: date, live: bool) -> None:
        s = by_coin.get(cid)
        ts = pd.Timestamp(day)
        if s is None or ts not in s.index:
            return
        rk = None
        vol = mcap = None
        if (cid, ts) in rank_at.index:
            row = rank_at.loc[(cid, ts)]
            rk, vol, mcap = int(row["rank"]), float(row["volume_usd"]), float(row["market_cap_usd"])
        src = "coingecko_live" if live and day == AS_OF else ("coinmetrics" if cid == BTC else "coingecko")
        price_rows[(cid, day)] = (cid, day, float(s[ts]), vol, mcap, rk, src)

    def days(a: date, b: date):
        d = a
        while d <= b:
            yield d
            d += timedelta(days=1)

    for d in days(date(2026, 5, 1), AS_OF):
        add_price(BTC, d, True)
    for cid in used:
        for d in days(date(2026, 6, 15), AS_OF):
            add_price(cid, d, True)
    for cid in top_ids:
        for d in days(date(2026, 8, 10), AS_OF):
            add_price(cid, d, True)

    # --- BTC cycle state ----------------------------------------------------------------------------------
    cfg = get_config()
    feats = cycle_features(btc, mvrv, [pd.Timestamp(h) for h in cfg.rules.cycle.halvings],
                           cfg.rules.cycle.sell.trend_weekly_sma)
    feats = feats[feats.index <= pd.Timestamp(AS_OF)]
    states = [market_state(feats, cfg, d) for d in days(AS_OF - timedelta(days=13), AS_OF)]

    # --- people, entries and trades -----------------------------------------------------------------------
    out: list[str] = []
    w = out.append
    w("-- Demo data for the local stack. GENERATED by supabase/seed/build_seed.py: edit that, not this.")
    w("-- Invented people and baskets; real public market prices. No production data. Local use only.")
    w(f"-- Every demo account signs in with the password {PASSWORD}.")
    w("")
    w("begin;")
    w("")
    w("-- The challenge the migrations create, opened earlier so the demo has history.")
    w(f"update public.challenges set opened_on = '{CHALLENGE_OPENED}' where name = '1 Bitty Challenge';")
    w("")
    w("-- Coins: names and icons for everything the pages show")
    w("insert into public.coins (id, symbol, name, image_url, updated_at) values")
    w(",\n".join(f"  ({q(c)}, {q(s)}, {q(n)}, {q(i) if i else 'null'}, '{AS_OF}T00:00:00Z')" for c, s, n, i in coin_rows) + ";")
    w("")
    w("-- Daily closes (real). The last day is 'coingecko_live' with ranks: the picker's top 100.")
    w("insert into public.daily_prices (coin_id, date, close, volume_usd, market_cap_usd, rank, source) values")
    rows = sorted(price_rows.values(), key=lambda r: (r[1], r[0]))
    w(",\n".join(f"  ({q(r[0])}, '{r[1]}', {num(r[2])}, {num(r[3])}, {num(r[4])}, {num(r[5])}, {q(r[6])})" for r in rows) + ";")
    w("")
    w("-- BTC against its high, as the daily job records it")
    w("insert into public.market_state (day, btc_price, ath, ath_date, drawdown, days_since_ath, mvrv, days_since_halving, rebuy_window_open, config_hash, created_at) values")
    w(",\n".join(
        f"  ('{s.day}', {num(s.btc_price)}, {num(s.ath)}, '{s.ath_date}', {num(s.drawdown)}, {s.days_since_ath}, "
        f"{num(s.mvrv)}, {s.days_since_halving}, {str(s.rebuy_window_open).lower()}, {q(cfg.config_hash)}, '{s.day}T13:15:00Z')"
        for s in states) + ";")
    w("")
    w("-- People. The sign-up trigger creates each profile; the updates below set the rest.")
    w("insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,")
    w("  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,")
    w("  email_change_token_new, email_change, email_change_token_current, reauthentication_token) values")
    users = []
    for p in PEOPLE:
        users.append(
            f"  ('00000000-0000-0000-0000-000000000000', '{uid(p.name)}', 'authenticated', 'authenticated', {q(email(p.name))}, "
            f"extensions.crypt({q(PASSWORD)}, {q(SALT)}), '{p.joined}T09:00:00Z', "
            f"'{{\"provider\":\"email\",\"providers\":[\"email\"]}}', '{{\"full_name\":\"{p.name}\"}}', "
            f"'{p.joined}T09:00:00Z', '{p.joined}T09:00:00Z', '', '', '', '', '', '')")
    w(",\n".join(users) + ";")
    w("")
    w("insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values")
    w(",\n".join(
        f"  ('{uid(p.name)}', '{uid(p.name)}', '{{\"sub\":\"{uid(p.name)}\",\"email\":\"{email(p.name)}\"}}', 'email', "
        f"'{p.joined}T09:00:00Z', '{p.joined}T09:00:00Z', '{p.joined}T09:00:00Z')" for p in PEOPLE) + ";")
    w("")
    for p in PEOPLE:
        w(f"update public.profiles set is_member = {str(p.member).lower()}, is_admin = {str(p.admin).lower()}, "
          f"display_name = {q(p.name)}, created_at = '{p.joined}T09:00:00Z' where id = '{uid(p.name)}';")
    w("")

    entry_sql: list[str] = []
    trade_sql: list[str] = []

    def trade(ref: str, day: date, asset: str, side: str, qty: float, price: float, fee: float, kind: str) -> None:
        trade_sql.append(
            f"  ((select id from public.entries where user_id = '{ref}'), '{day}', {q(asset)}, {q(side)}, "
            f"{num(qty)}, {num(price)}, {num(fee)}, {q(kind)}, '{day}T12:00:00Z')")

    for p in PEOPLE:
        if p.started is None:
            continue
        ref = uid(p.name)
        # the entry row holds the basket as it is now: slots already filled have turned into coins
        fills = [m.coin for m in p.moves if m.kind == "fill" and m.coin]
        now_basket = [*p.basket, *fills]
        entry_sql.append(
            f"  ((select id from public.challenges where name = '1 Bitty Challenge'), '{ref}', '{p.started}', "
            f"{p.btc_in}, array[{', '.join(q(c) for c in now_basket)}], {p.slots - len(fills)}, '{p.started}T12:00:00Z')")
        n = len(p.basket)
        btc_px = close(BTC, p.started)
        sold = floor_dp(p.btc_in * n / (n + p.slots), 8)
        gross = sold * btc_px
        sale_fee = gross * FEE
        trade(ref, p.started, BTC, "sell", sold, btc_px, sale_fee, "buy_in")
        per_coin = (gross - sale_fee) / n
        held: dict[str, float] = {}
        usdt = 0.0
        usdt += gross - sale_fee
        for c in p.basket:
            px = close(c, p.started)
            cost = per_coin / (1 + FEE)
            qty = sig(cost / px)
            fee = qty * px * FEE
            held[c] = qty
            usdt -= qty * px + fee
            trade(ref, p.started, c, "buy", qty, px, fee, "buy_in")
        waiting_btc = p.btc_in - sold
        slots = p.slots
        for m in p.moves:
            if m.kind == "fill":
                assert m.coin is not None
                share = floor_dp(waiting_btc / slots, 8)
                bpx = close(BTC, m.day)
                g = share * bpx
                sfee = g * FEE
                trade(ref, m.day, BTC, "sell", share, bpx, sfee, "fill")
                px = close(m.coin, m.day)
                cost = (g - sfee) / (1 + FEE)
                qty = sig(cost / px)
                fee = qty * px * FEE
                trade(ref, m.day, m.coin, "buy", qty, px, fee, "fill")
                held[m.coin] = qty
                waiting_btc -= share
                slots -= 1
            elif m.kind == "sell":
                assert m.coin is not None
                px = close(m.coin, m.day)
                qty = sig(held[m.coin] * m.fraction)
                fee = qty * px * FEE
                held[m.coin] -= qty
                usdt += qty * px - fee
                trade(ref, m.day, m.coin, "sell", qty, px, fee, "sell")
            else:  # rebuy: everything in USDT back into BTC
                px = close(BTC, m.day)
                qty = floor_dp(usdt / (px * (1 + FEE)), 8)
                fee = qty * px * FEE
                usdt -= qty * px + fee
                trade(ref, m.day, BTC, "buy", qty, px, fee, "rebuy")

    w("-- Entries (one per person), then every trade. The fairness trigger checks balances at commit.")
    w("insert into public.entries (challenge_id, user_id, started_on, btc_in, basket, open_slots, created_at) values")
    w(",\n".join(entry_sql) + ";")
    w("")
    w("insert into public.entry_trades (entry_id, traded_on, asset, side, qty, price_usd, fee_usd, kind, created_at) values")
    w(",\n".join(trade_sql) + ";")
    w("")
    w("commit;")
    w("")
    OUT.write_text("\n".join(out))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB): {len(coin_rows)} coins, {len(rows)} prices, "
          f"{len(entry_sql)} entries, {len(trade_sql)} trades; data from {data_dir()}")


if __name__ == "__main__":
    main()
