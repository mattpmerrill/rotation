"""Daily-step portfolio simulator.

Every decision is made on day t's close using only data up to t, and filled at that
close with fees + slippage (crypto trades 24/7, so the next open is this close).
All rule logic comes from rotation.rules; this file only keeps the books.

Books:
  vault_btc     the Vault / BTC core (quantity)
  vault_usd     core BTC moved to stables by euphoria actions, waiting for the rebuy
  reserve       tax reserve in USD (counted in value, excluded from the net-BTC headline)
  holdings      open alt positions
  idle money    usd_buckets mode: `cash` in USD. btc_sleeve mode: `sleeve_btc`, the
                sleeve's uninvested money held as BTC. Every spend/receive goes through
                spend() / receive(), which is the only place the two modes differ on money.

In btc_sleeve mode the bucket weights (minus Vault and leverage) are re-normalised and
applied to the sleeve's value, the core is never sold to rebalance, and breakers watch
the sleeve. In usd_buckets mode the table applies to the whole portfolio in USD.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
import pandas as pd

from rotation.config import Rules
from rotation.rules.positions import (
    Position,
    hold_step,
    ladder_step,
    ladder_upside,
    open_position,
    rotation_check,
    route_realized,
    time_stop_hit,
    trim_value,
)

ALT_BUCKETS = ("large", "mid", "small")


@dataclass
class Holding:
    pos: Position
    cost: float  # USD cost basis of the remaining qty
    bucket: str
    last_px: float
    last_seen: pd.Timestamp


@dataclass
class Options:
    """Switches for the Phase 0 experiments; defaults = the rules as written."""

    take_profits: bool = True  # False: no ladder rungs / runner (Q1 "hold")
    regime_override: str | None = None  # force one regime (Q3)
    use_altbtc_gate: bool = True  # Q2
    label: str = "rules"


@dataclass
class Result:
    equity: pd.DataFrame
    trades: pd.DataFrame
    options: Options
    notes: list[str] = field(default_factory=list)


def bucket_for(rank: float, r: Rules) -> str | None:
    t = r.buckets.size_tiers
    if not rank or np.isnan(rank) or rank > r.universe.top_n:
        return None
    if rank <= t.large_max_rank:
        return "large"
    if rank <= t.mid_max_rank:
        return "mid"
    return "small"


class Sim:
    def __init__(self, r: Rules, feats: pd.DataFrame, mkt: pd.DataFrame, opts: Options):
        self.r, self.opts = r, opts
        self.cost = r.backtest.fee_per_side + r.backtest.slippage_per_side
        self.days = {d: g.set_index("coin_id") for d, g in feats.groupby("date")}
        self.mkt = mkt
        self.sleeve = r.portfolio.mode == "btc_sleeve"
        self.cash = 0.0 if self.sleeve else r.backtest.initial_usd
        self.sleeve_btc = 0.0
        self.sleeve_cost = 0.0
        self.reserve = 0.0
        self.vault_btc = 0.0
        self.vault_cost = 0.0
        self.vault_usd = 0.0
        self.holdings: dict[str, Holding] = {}
        self.peak = 0.0
        self.breaker = 0
        self.freeze_until: pd.Timestamp | None = None
        self.defend_until: pd.Timestamp | None = None
        self.executed_tier = 0
        self.quiet_days = 0
        self.rebuys_done = 0
        self.last_rebuy: pd.Timestamp | None = None
        self.trades: list[dict] = []
        self.rotations: list[pd.Timestamp] = []
        self.last_exit: dict[str, pd.Timestamp] = {}
        self.rows: list[dict] = []

    # --- books ------------------------------------------------------------------

    def alts_value(self) -> float:
        return sum(h.pos.qty * h.last_px for h in self.holdings.values())

    def value(self, btc: float) -> float:
        return (
            self.cash
            + self.reserve
            + self.vault_usd
            + self.vault_btc * btc
            + self.sleeve_btc * btc
            + self.alts_value()
        )

    def book(self, btc: float) -> float:
        """The value position sizes, buckets and breakers are measured against."""
        if self.sleeve:
            return self.sleeve_btc * btc + self.alts_value()
        return self.value(btc)

    def idle(self, btc: float) -> float:
        """USD value of the money available for new entries."""
        return self.sleeve_btc * btc if self.sleeve else self.cash

    def weights(self, regime: str) -> dict[str, float]:
        """Bucket targets as fractions of the book. Sleeve mode drops Vault and leverage
        and re-normalises the rest (e.g. Expand: 20/15/10 alts + 10 dry -> 36/27/18/18%)."""
        w = self.r.buckets.for_regime(regime)
        keys = ("large", "mid", "small", "dry_powder")
        if not self.sleeve:
            return {k: getattr(w, k) for k in (*keys, "vault_btc")}
        total = sum(getattr(w, k) for k in keys)
        if total <= 0:
            return {"large": 0.0, "mid": 0.0, "small": 0.0, "dry_powder": 1.0}
        return {k: getattr(w, k) / total for k in keys}

    def spend(self, usd: float, t, btc: float) -> None:
        """Pay for an alt entry. Sleeve mode sells sleeve BTC (one more fee leg, and the
        BTC's own gain reserves long-term tax)."""
        if not self.sleeve:
            self.cash -= usd
            return
        qty = min(usd / (btc * (1 - self.cost)), self.sleeve_btc)
        basis = self.sleeve_cost * qty / self.sleeve_btc if self.sleeve_btc else 0.0
        gain = qty * btc * (1 - self.cost) - basis
        tax = self.r.routing.long_term_rate * gain
        if tax > 0:
            self.reserve += tax
            qty = min(qty + tax / (btc * (1 - self.cost)), self.sleeve_btc)
        self.sleeve_btc -= qty
        self.sleeve_cost -= basis

    def receive(self, usd: float, t, btc: float) -> None:
        """Money back into idle funds. Sleeve mode buys BTC into the sleeve."""
        if usd <= 0:
            return
        if not self.sleeve:
            self.cash += usd
            return
        self.sleeve_btc += usd * (1 - self.cost) / btc
        self.sleeve_cost += usd

    def bucket_value(self, bucket: str) -> float:
        return sum(h.pos.qty * h.last_px for h in self.holdings.values() if h.bucket == bucket)

    def buy_btc(self, usd: float, t, btc: float, reason: str) -> None:
        if usd <= 0:
            return
        qty = usd * (1 - self.cost) / btc
        self.vault_btc += qty
        self.vault_cost += usd
        self.trades.append(
            {
                "date": t,
                "coin_id": "bitcoin",
                "side": "buy",
                "usd": usd,
                "qty": qty,
                "reason": reason,
            }
        )

    def sell_vault(self, qty: float, t, btc: float, reason: str) -> float:
        """Sell Vault BTC at average cost; the realized gain reserves tax like any sale.
        Returns USD proceeds after costs and tax reserve."""
        qty = min(qty, self.vault_btc)
        if qty <= 0:
            return 0.0
        proceeds = qty * btc * (1 - self.cost)
        basis = self.vault_cost * qty / self.vault_btc
        gain = proceeds - basis
        rb = self.r.routing
        rate = (
            rb.long_term_rate if self.r.rebalance.vault_tax == "long_term" else rb.tax_reserve_rate
        )
        tax = rate * gain
        if tax > 0:
            self.reserve += tax
        else:
            release = min(self.reserve, -tax)
            self.reserve -= release
            tax = -release
        self.vault_btc -= qty
        self.vault_cost -= basis
        self.trades.append(
            {
                "date": t,
                "coin_id": "bitcoin",
                "side": "sell",
                "usd": proceeds,
                "qty": qty,
                "gain": gain,
                "reason": reason,
            }
        )
        return proceeds - tax

    def sell(self, coin: str, qty: float, px: float, t, btc: float, reason: str) -> None:
        h = self.holdings[coin]
        qty = min(qty, h.pos.qty)
        if qty <= 0:
            return
        proceeds = qty * px * (1 - self.cost)
        basis = h.cost * qty / h.pos.qty
        gain = proceeds - basis
        held = (t.date() - h.pos.entry_date).days
        routed = route_realized(gain, held, self.r.routing)
        if gain > 0:
            self.reserve += routed.tax_reserve
            self.buy_btc(routed.vault_btc, t, btc, "profit_routing")
            self.receive(basis + routed.dry_powder + routed.recycle, t, btc)
        else:
            release = min(self.reserve, -routed.tax_reserve)  # losses release reserve
            self.reserve -= release
            self.receive(proceeds + release, t, btc)
        self.trades.append(
            {
                "date": t,
                "coin_id": coin,
                "side": "sell",
                "usd": proceeds,
                "qty": qty,
                "px": px,
                "gain": gain,
                "held_days": held,
                "reason": reason,
            }
        )
        remaining = h.pos.qty - qty
        if remaining <= 1e-12:
            del self.holdings[coin]
            self.last_exit[coin] = t
        else:
            h.cost -= basis
            h.pos = replace(h.pos, qty=remaining)

    def buy(self, coin: str, row: pd.Series, usd: float, t, bucket: str, btc: float) -> None:
        px = row["close"]
        qty = usd * (1 - self.cost) / px
        self.spend(usd, t, btc)
        pos = open_position(coin, t.date(), px, qty, row["stop"])
        self.holdings[coin] = Holding(pos, usd, bucket, px, t)
        self.trades.append(
            {
                "date": t,
                "coin_id": coin,
                "side": "buy",
                "usd": usd,
                "qty": qty,
                "px": px,
                "score": int(row["score"]),
                "reason": f"entry_{bucket}",
            }
        )

    # --- one day ------------------------------------------------------------------

    def step(self, t: pd.Timestamp) -> None:
        r, m = self.r, self.mkt.loc[t]
        btc = m["btc_close"]
        day = self.days.get(t)

        # mark to market; dead coins exit at a haircut
        for coin in list(self.holdings):
            h = self.holdings[coin]
            if day is not None and coin in day.index and not np.isnan(day.at[coin, "close"]):
                h.last_px, h.last_seen = day.at[coin, "close"], t
            elif (t - h.last_seen).days > r.backtest.delisted_after_days:
                self.sell(
                    coin,
                    h.pos.qty,
                    h.last_px * (1 - r.backtest.delisted_haircut),
                    t,
                    btc,
                    "delisted",
                )

        if not self.rows:  # first day
            self.start(t, btc, self.regime(t, m))
        v = self.book(btc)

        # circuit breakers: level 1 freezes entries, level 2 forces Defend for a week;
        # after level 2 the peak re-bases so the breaker re-arms instead of latching
        self.peak = max(self.peak, v)
        dd = 1 - v / self.peak
        b = r.breakers
        level = 2 if dd >= b.level_2.drawdown else 1 if dd >= b.level_1.drawdown else 0
        if level >= 1 and self.breaker == 0:
            self.freeze_until = t + pd.Timedelta(days=b.level_1.entry_freeze_days)
            self.trades.append(
                {"date": t, "coin_id": "", "side": "", "usd": 0.0, "reason": f"breaker_{level}"}
            )
        if level == 2:
            self.defend_until = t + pd.Timedelta(days=b.defend_days)
            self.trades.append(
                {"date": t, "coin_id": "", "side": "", "usd": 0.0, "reason": "breaker_2_defend"}
            )
            if b.rebase_after_fire:
                self.peak, level = v, 0
        self.breaker = level
        forced = self.defend_until is not None and t < self.defend_until
        regime = "defend" if forced else self.regime(t, m)

        # exits: stops, ladder, runner, time stop
        if day is not None:
            for coin in list(self.holdings):
                if coin not in day.index:
                    continue
                h, row = self.holdings[coin], day.loc[coin]
                px, sma20 = row["close"], row["sma20"]
                if self.opts.take_profits:
                    s = ladder_step(h.pos, px, None if np.isnan(sma20) else sma20, r.ladder)
                else:
                    s = hold_step(h.pos, px)
                for a in s.actions:
                    self.sell(coin, a.qty, px, t, btc, a.reason)
                if s.position is not None and coin in self.holdings:
                    self.holdings[coin].pos = replace(s.position, qty=self.holdings[coin].pos.qty)
                    if time_stop_hit(s.position, t.date(), px, int(row["score"]), r.time_stop):
                        self.sell(coin, self.holdings[coin].pos.qty, px, t, btc, "time_stop")

        self.euphoria(t, m, btc)
        self.rebuy(t, m, btc)

        v = self.book(btc)
        for coin in list(self.holdings):  # trim at 15% back to 10%
            h = self.holdings[coin]
            usd = trim_value(h.pos.qty * h.last_px, v, r.positions)
            if usd > 0:
                self.sell(coin, usd / h.last_px, h.last_px, t, btc, "trim")

        if t.dayofweek == r.rebalance.weekday:
            self.rebalance(t, btc, regime, day)

        self.entries(t, btc, regime, day)
        self.record(t, btc, regime, m)

    def regime(self, t, m) -> str:
        if self.opts.regime_override:
            return self.opts.regime_override
        return m["regime"] if isinstance(m["regime"], str) else "accumulate"

    # --- euphoria + rebuy -----------------------------------------------------------

    def euphoria(self, t, m, btc: float) -> None:
        ea = self.r.euphoria_actions
        tier = int(m["tier"])
        self.quiet_days = self.quiet_days + 1 if tier == 0 else 0
        if self.executed_tier and self.quiet_days >= ea.reset_weeks * 7:
            self.executed_tier = 0
        if tier <= self.executed_tier:
            return
        tiers = sorted(ea.tiers, key=lambda x: x.min_flags)
        for i in range(self.executed_tier, tier):
            spec = tiers[i]
            for coin in list(self.holdings):
                h = self.holdings[coin]
                self.sell(coin, h.pos.qty * spec.sell_alts, h.last_px, t, btc, f"euphoria_{i + 1}")
            move = self.vault_btc * spec.vault_to_stables
            if move > 0:
                self.vault_usd += self.sell_vault(move, t, btc, f"euphoria_{i + 1}_vault")
        self.executed_tier = tier
        self.rebuys_done = 0

    def rebuy(self, t, m, btc: float) -> None:
        rb = self.r.euphoria_actions.rebuy
        if not m["rebuy"] or self.vault_usd <= 0 or self.rebuys_done >= rb.tranches:
            return
        if self.last_rebuy is not None and (t - self.last_rebuy).days < rb.tranche_spacing_days:
            return
        usd = self.vault_usd / (rb.tranches - self.rebuys_done)
        self.vault_usd -= usd
        self.buy_btc(usd, t, btc, f"rebuy_{self.rebuys_done + 1}")
        self.rebuys_done += 1
        self.last_rebuy = t

    # --- rebalance + entries ------------------------------------------------------------

    def start(self, t, btc: float, regime: str) -> None:
        if self.sleeve:
            # Matt already holds the BTC: no purchase fee on day one
            total = self.r.portfolio.initial_btc
            self.vault_btc = total * (1 - self.r.portfolio.sleeve_frac)
            self.sleeve_btc = total * self.r.portfolio.sleeve_frac
            self.vault_cost = self.vault_btc * btc
            self.sleeve_cost = self.sleeve_btc * btc
        else:
            self.rebalance_vault(t, btc, self.value(btc), regime, force=True)

    def rebalance_vault(self, t, btc, v, regime, force=False) -> None:
        if self.sleeve:
            return  # the core is never sold or topped up to rebalance
        rb = self.r.rebalance
        w = self.r.buckets.for_regime(regime)
        gap = w.vault_btc * v - self.vault_btc * btc
        if gap < -rb.vault_band * v and rb.vault == "two_way":
            self.cash += self.sell_vault(-gap / btc, t, btc, "vault_trim")
            return
        spare = self.cash - w.dry_powder * v
        usd = min(gap, spare) if not force else min(gap, self.cash)
        if usd > rb.min_trade_frac * v:
            self.cash -= usd
            self.buy_btc(usd, t, btc, "vault_rebalance")

    def rebalance(self, t, btc, regime, day) -> None:
        r = self.r
        v = self.book(btc)
        w = self.weights(regime)
        for bucket in ALT_BUCKETS:
            limit = (w[bucket] + r.rebalance.sell_excess_band) * v
            held = sorted(
                (c for c, h in self.holdings.items() if h.bucket == bucket),
                key=lambda c: day.at[c, "score"] if day is not None and c in day.index else -1,
            )
            for coin in held:
                if self.bucket_value(bucket) <= limit:
                    break
                h = self.holdings[coin]
                self.sell(coin, h.pos.qty, h.last_px, t, btc, f"rebalance_{regime}")
        self.rebalance_vault(t, btc, self.value(btc), regime)

    def entries(self, t, btc, regime, day) -> None:
        r = self.r
        if day is None:
            return
        if self.freeze_until is not None and t < self.freeze_until:
            return
        if self.executed_tier and r.euphoria_actions.pause_entries:
            return
        gate = "gates_pass" if self.opts.use_altbtc_gate else "gates_pass_ex_altbtc"
        size = self.entry_size(day)
        ok = day[gate] & (size > 0)
        cool = r.positions.reentry_cooldown_days
        recent = [c for c, d in self.last_exit.items() if (t - d).days < cool]
        cands = day[ok & ~day.index.isin(list(self.holdings)) & ~day.index.isin(recent)]
        if cands.empty:
            return
        cands = cands.sort_values(["score", "reward_risk"], ascending=False)
        w = self.weights(regime)
        for coin, row in cands.iterrows():
            v = self.book(btc)
            bucket = bucket_for(row["rank"], r)
            if bucket is None:
                continue
            if len(self.holdings) >= r.positions.max_positions:
                if not self.try_rotate(t, btc, day, coin, row):
                    continue
                v = self.book(btc)
            room = w[bucket] * v - self.bucket_value(bucket)
            # 5% headroom: in sleeve mode, spending also sells BTC to reserve its own tax
            spare = min(self.idle(btc) - w["dry_powder"] * v, 0.95 * self.idle(btc))
            usd = min(r.positions.max_alt_weight * v * size[coin], room, spare)
            if usd < r.rebalance.min_trade_frac * v:
                continue
            self.buy(coin, row, usd, t, bucket, btc)

    def entry_size(self, day: pd.DataFrame) -> pd.Series:
        """Full / half / pass from score and reward:risk, using THIS run's rules (so score
        variants take effect without rebuilding features)."""
        sr = self.r.score
        size = np.select(
            [day["score"] >= sr.full_size_at, day["score"] >= sr.half_size_at], [1.0, 0.5], 0.0
        )
        return pd.Series(
            np.where(day["reward_risk"] >= sr.min_reward_risk, size, 0.0), index=day.index
        )

    def try_rotate(self, t, btc, day, coin_b, row_b) -> bool:
        """At max positions: swap the weakest holding for B if rule 7 says so."""
        r = self.r
        rc = r.rotation
        recent = [d for d in self.rotations if (t - d).days < 7]
        if len(recent) >= rc.max_per_week:
            return False
        best = None
        for coin_a, h in self.holdings.items():
            if coin_a not in day.index or (t.date() - h.pos.entry_date).days < rc.min_hold_days:
                continue
            a = day.loc[coin_a]
            if rc.upside == "ladder":
                u_a = ladder_upside(h.pos, a["close"], r.ladder)
                u_b = ladder_upside(None, row_b["close"], r.ladder)
            else:
                u_a = a["target"] / a["close"] - 1
                u_b = row_b["target"] / row_b["close"] - 1
            chk = rotation_check(
                upside_a=u_a,
                score_a=int(a["score"]),
                upside_b=u_b,
                score_b=int(row_b["score"]),
                gain_a=a["close"] / h.pos.entry_price - 1,
                a_in_trend=bool(a["trend"]),
                cfg=r.rotation,
                tax_rate=r.routing.tax_reserve_rate,
            )
            if chk.rotate and (best is None or chk.edge_pp - chk.hurdle_pp > best[1]):
                best = (coin_a, chk.edge_pp - chk.hurdle_pp)
        if best is None:
            return False
        h = self.holdings[best[0]]
        self.sell(best[0], h.pos.qty, h.last_px, t, btc, f"rotate_to_{coin_b}")
        self.rotations.append(t)
        return True

    def record(self, t, btc, regime, m) -> None:
        v = self.value(btc)
        alts = self.alts_value()
        self.rows.append(
            {
                "date": t,
                "value_usd": v,
                "value_btc": v / btc,
                "net_btc": (v - self.reserve) / btc,  # headline: tax reserve treated as owed
                "btc_close": btc,
                "cash": self.cash,
                "reserve": self.reserve,
                "vault_btc": self.vault_btc,
                "vault_usd": self.vault_usd,
                "sleeve_btc": self.sleeve_btc,
                "sleeve_value_btc": self.book(btc) / btc if self.sleeve else float("nan"),
                "alts_usd": alts,
                "positions": len(self.holdings),
                "regime": regime,
                "flags": int(m["flag_count"]),
                "breaker": self.breaker,
            }
        )


def run(
    r: Rules,
    feats: pd.DataFrame,
    mkt: pd.DataFrame,
    start: str,
    end: str,
    opts: Options | None = None,
) -> Result:
    opts = opts or Options()
    f = feats[(feats["date"] >= start) & (feats["date"] <= end)]
    m = mkt.loc[start:end]
    sim = Sim(r, f, m, opts)
    for t in m.index:
        sim.step(t)
    return Result(pd.DataFrame(sim.rows).set_index("date"), pd.DataFrame(sim.trades), opts)


def market_signals(r: Rules, market: pd.DataFrame) -> pd.DataFrame:
    """Everything the sim needs from the market frame, precomputed once."""
    from rotation.rules.market import euphoria_tier, flags, rebuy_signal, regime

    f = flags(market, r.flags)
    out = pd.DataFrame(index=market.index)
    out["btc_close"] = market["btc_close"]
    out["flag_count"] = f["flag_count"]
    out["regime"] = regime(market, f["flag_count"], r.regime)
    tiers = euphoria_tier(f["flag_count"], market["btc_close"], r.euphoria_actions)
    out["tier"] = tiers["tier"]
    out["backstop"] = tiers["backstop"]
    out["rebuy"] = rebuy_signal(market["btc_close"], f["mvrv_z_value"], r.euphoria_actions)
    return out
