"""Position rules: profit ladder + runner (rule 4), time stop (6), trim (3),
profit routing (5), rotation (7), leverage sizing (8).

Everything is evaluated on the daily close. Prices are USD (Matt, 2026-09-23).
Functions return new state instead of mutating, so the simulator and the live engine
can both replay them.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date

from rotation.config import Ladder, LeverageRules, Positions, RotationRules, Routing, TimeStop


@dataclass(frozen=True)
class Position:
    coin_id: str
    entry_date: date
    entry_price: float
    original_qty: float
    qty: float
    stop: float
    high: float  # highest close since entry
    rungs_hit: int = 0


@dataclass(frozen=True)
class Action:
    kind: str  # "sell" (partial) or "exit" (everything left)
    qty: float
    reason: str  # "rung_1".."rung_n", "stop", "runner_sma", "runner_high", "time_stop", "trim"


@dataclass(frozen=True)
class Step:
    position: Position | None  # None once fully exited
    actions: list[Action] = field(default_factory=list)


def open_position(coin_id: str, d: date, price: float, qty: float, stop: float) -> Position:
    return Position(coin_id, d, price, qty, qty, stop, price)


def ladder_step(p: Position, close: float, sma20: float | None, cfg: Ladder) -> Step:
    """Apply one daily close. Order: stop, then rungs (several can fire on one day),
    then the runner trail once every rung has fired."""
    p = replace(p, high=max(p.high, close))
    if close <= p.stop:
        return Step(None, [Action("exit", p.qty, "stop")])

    actions: list[Action] = []
    gain = close / p.entry_price - 1
    while p.rungs_hit < len(cfg.rungs) and gain >= cfg.rungs[p.rungs_hit].gain:
        rung = cfg.rungs[p.rungs_hit]
        sell = min(rung.sell * p.original_qty, p.qty)
        actions.append(Action("sell", sell, f"rung_{p.rungs_hit + 1}"))
        p = replace(
            p,
            qty=p.qty - sell,
            stop=max(p.stop, p.entry_price * (1 + rung.stop_to_gain)),
            rungs_hit=p.rungs_hit + 1,
        )

    if p.rungs_hit == len(cfg.rungs) and p.qty > 0:
        r = cfg.runner
        if sma20 is not None and close < sma20:
            return Step(None, [*actions, Action("exit", p.qty, "runner_sma")])
        if close <= p.high * (1 - r.trail_from_high):
            return Step(None, [*actions, Action("exit", p.qty, "runner_high")])
    return Step(p, actions)


def time_stop_hit(p: Position, today: date, close: float, score: int, cfg: TimeStop) -> bool:
    """45+ days held, up less than 10%, and score below 3 -> exit."""
    held = (today - p.entry_date).days
    gain = close / p.entry_price - 1
    return held >= cfg.days and gain < cfg.min_gain and score < cfg.exit_if_score_below


def trim_value(position_value: float, portfolio_value: float, cfg: Positions) -> float:
    """USD to sell to bring an alt back to max weight once it reaches the trim level."""
    if portfolio_value <= 0 or position_value / portfolio_value < cfg.trim_at_weight:
        return 0.0
    return position_value - cfg.max_alt_weight * portfolio_value


# --- profit routing (rule 5) ----------------------------------------------------


@dataclass(frozen=True)
class Routed:
    tax_reserve: float  # negative = a loss releasing reserve (portfolio clamps at 0)
    vault_btc: float
    dry_powder: float
    recycle: float


def route_realized(gain: float, held_days: int, cfg: Routing) -> Routed:
    """Split a realized USD gain. Tax reserve first (short- or long-term rate), then
    50/25/25. A loss routes nothing but releases reserve, so the reserve tracks NET gain."""
    rate = cfg.long_term_rate if held_days >= cfg.long_term_days else cfg.tax_reserve_rate
    tax = rate * gain
    if gain <= 0:
        return Routed(tax, 0.0, 0.0, 0.0)
    rest = gain - tax
    return Routed(tax, rest * cfg.vault_btc, rest * cfg.dry_powder, rest * cfg.recycle)


# --- rotation (rule 7) ----------------------------------------------------------


@dataclass(frozen=True)
class RotationCheck:
    rotate: bool
    edge_pp: float  # U_B*S_B/5 - U_A*S_A/5, in percentage points
    hurdle_pp: float  # fees% + tax% + hurdle
    reason: str


def rotation_check(
    upside_a: float,
    score_a: int,
    upside_b: float,
    score_b: int,
    gain_a: float,
    a_in_trend: bool,
    cfg: RotationRules,
    tax_rate: float,
) -> RotationCheck:
    """Rotate A -> B if U_B*S_B/5 - U_A*S_A/5 > fees% + tax% + 10.

    upside_* and gain_a are fractions (0.6 = 60%). tax% is the tax realized by selling A,
    as a percent of A's current value: rate * g / (1 + g) for an unrealized gain g."""
    edge = (upside_b * 100) * score_b / 5 - (upside_a * 100) * score_a / 5
    tax_pct = tax_rate * max(gain_a, 0.0) / (1 + max(gain_a, 0.0)) * 100
    hurdle = cfg.round_trip_fee * 100 + tax_pct + cfg.hurdle_pp
    if score_a >= cfg.protect_score and a_in_trend:
        return RotationCheck(False, edge, hurdle, "protected: A scores 4+ in a trend")
    ok = edge > hurdle
    return RotationCheck(ok, edge, hurdle, "edge clears hurdle" if ok else "edge below hurdle")


# --- leverage sizing (rule 8) ---------------------------------------------------


@dataclass(frozen=True)
class LeveragePlan:
    ok: bool
    reason: str
    notional: float = 0.0
    margin: float = 0.0
    leverage: float = 0.0
    liquidation_price: float = 0.0


def leverage_plan(
    symbol: str,
    score: int,
    entry: float,
    stop: float,
    portfolio_value: float,
    margin_available: float,
    open_count: int,
    cfg: LeverageRules,
) -> LeveragePlan:
    """Isolated long. Size so hitting the stop loses 1% of the portfolio; choose the
    leverage so liquidation sits at least 2x as far away as the stop; cap at 3x and at the
    leverage bucket's free margin."""
    if not cfg.enabled:
        return LeveragePlan(False, "leverage disabled in config")
    if symbol not in cfg.assets:
        return LeveragePlan(False, f"{symbol} not in {cfg.assets}")
    if score < cfg.min_score:
        return LeveragePlan(False, f"score {score} < {cfg.min_score}")
    if open_count >= cfg.max_open:
        return LeveragePlan(False, f"already {open_count} open (max {cfg.max_open})")
    stop_dist = (entry - stop) / entry
    if stop_dist <= 0:
        return LeveragePlan(False, "stop must be below entry for a long")

    notional = cfg.risk_per_trade * portfolio_value / stop_dist
    # isolated long liquidates at ~ entry * (1 - 1/L + mmr): need 1/L - mmr >= ratio * stop_dist
    max_lev_for_liq = 1 / (cfg.min_liq_to_stop_ratio * stop_dist + cfg.maintenance_margin)
    lev = min(cfg.max_multiple, max_lev_for_liq)
    if lev < 1:
        return LeveragePlan(False, "stop too wide for any leverage with a safe liquidation")
    margin = notional / lev
    if margin > margin_available:
        margin = margin_available
        notional = margin * lev
    if notional <= 0:
        return LeveragePlan(False, "no free margin in the leverage bucket")
    liq = entry * (1 - 1 / lev + cfg.maintenance_margin)
    return LeveragePlan(True, "ok", notional, margin, lev, liq)
