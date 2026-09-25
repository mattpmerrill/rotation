"""Typed loader for config/rules.yaml and config/universe.yaml.

Models use extra="forbid" so a typo in the YAML fails loudly instead of being
silently ignored. `config_hash` is recorded on every engine output so any
result can be traced to the exact rules that produced it.
"""

from __future__ import annotations

import hashlib
from datetime import date
from functools import cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, model_validator

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = REPO_ROOT / "config"

_EPS = 1e-9


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --- universe -----------------------------------------------------------------


class HigherLows(_Model):
    swing_window: int
    lookback_days: int
    min_lows: int


class UniverseRules(_Model):
    top_n: int
    min_avg_daily_volume_usd: float
    volume_avg_days: int
    min_major_exchanges: int
    major_exchanges: list[str]
    max_unlock_frac_90d: float
    min_history_days: int
    altbtc_sma_days: int
    higher_lows: HigherLows
    require_catalyst: bool


# --- score --------------------------------------------------------------------


class Trend(_Model):
    fast_sma: int
    slow_sma: int


class BeatingBtc(_Model):
    sma: int
    rising_lookback_days: int


class Location(_Model):
    sma: int
    max_distance: float
    support_lookback_days: int
    support_max_distance: float


class Crowding(_Model):
    max_funding_8h: float
    max_oi_change_7d: float
    no_perp_market: Literal["pass", "fail"]


class Flow(_Model):
    fast_days: int
    slow_days: int


class ScoreRules(_Model):
    trend: Trend
    beating_btc: BeatingBtc
    location: Location
    crowding: Crowding
    flow: Flow
    full_size_at: int
    half_size_at: int
    min_reward_risk: float


# --- entry --------------------------------------------------------------------


class InitialStop(_Model):
    lookback_days: int
    buffer: float
    max_distance: float


class Target(_Model):
    lookback_days: int
    fallback_gain: float


class EntryRules(_Model):
    initial_stop: InitialStop
    target: Target


# --- buckets / positions ------------------------------------------------------

Regime = Literal["expand", "accumulate", "euphoria", "defend"]
REGIMES: tuple[Regime, ...] = ("expand", "accumulate", "euphoria", "defend")


class BucketWeights(_Model):
    vault_btc: float
    large: float
    mid: float
    small: float
    dry_powder: float
    leverage: float

    @model_validator(mode="after")
    def _sums_to_one(self) -> BucketWeights:
        total = sum(self.model_dump().values())
        if abs(total - 1.0) > _EPS:
            raise ValueError(f"bucket weights sum to {total}, expected 1.0")
        return self


class SizeTiers(_Model):
    large_max_rank: int
    mid_max_rank: int


class Buckets(_Model):
    expand: BucketWeights
    accumulate: BucketWeights
    euphoria: BucketWeights
    defend: BucketWeights
    size_tiers: SizeTiers

    def for_regime(self, regime: Regime) -> BucketWeights:
        return getattr(self, regime)


class Positions(_Model):
    max_positions: int
    max_alt_weight: float
    trim_at_weight: float
    reentry_cooldown_days: int


# --- ladder / routing / stops -------------------------------------------------


class Rung(_Model):
    gain: float
    sell: float
    stop_to_gain: float


class Runner(_Model):
    trail_sma_days: int
    trail_from_high: float


class Ladder(_Model):
    rungs: list[Rung]
    runner: Runner

    @model_validator(mode="after")
    def _valid(self) -> Ladder:
        gains = [r.gain for r in self.rungs]
        if gains != sorted(gains):
            raise ValueError("ladder rungs must be in ascending gain order")
        if sum(r.sell for r in self.rungs) >= 1.0:
            raise ValueError("ladder sells must leave a runner (sum < 1.0)")
        return self


class Routing(_Model):
    tax_reserve_rate: float
    long_term_rate: float
    long_term_days: int
    vault_btc: float
    dry_powder: float
    recycle: float

    @model_validator(mode="after")
    def _split_sums_to_one(self) -> Routing:
        total = self.vault_btc + self.dry_powder + self.recycle
        if abs(total - 1.0) > _EPS:
            raise ValueError(f"routing split sums to {total}, expected 1.0")
        return self


class TimeStop(_Model):
    days: int
    min_gain: float
    exit_if_score_below: int


class RotationRules(_Model):
    hurdle_pp: float
    protect_score: int
    round_trip_fee: float
    upside: Literal["ladder", "target"]
    min_hold_days: int
    max_per_week: int


class LeverageRules(_Model):
    enabled: bool
    bucket_is: Literal["collateral", "exposure"]
    max_multiple: float
    margin_mode: Literal["isolated", "cross"]
    risk_per_trade: float
    maintenance_margin: float
    min_liq_to_stop_ratio: float
    max_open: int
    assets: list[str]
    min_score: int
    direction: Literal["long"]


# --- regime / flags -----------------------------------------------------------


class RegimeRules(_Model):
    order: list[Regime]
    btc_sma_days: int
    btc_sma_slope_days: int
    dominance_trend_days: int
    breadth_min: float
    euphoria_min_flags: int


class FundingFlag(_Model):
    assets: list[str]
    above_8h: float
    persist_days: int


class FlagRules(_Model):
    mvrv_z_above: float
    mayer_multiple_above: float
    funding: FundingFlag
    altseason_index_above: float
    altseason_window_days: int
    dominance_drop_pts: float
    dominance_drop_days: int
    retail_mania: bool
    memes_in_top20_min: int
    btc_weekly_rsi_above: float
    rsi_period: int


class EuphoriaTier(_Model):
    min_flags: int
    sell_alts: float
    vault_to_stables: float


class Backstop(_Model):
    weekly_sma: int
    after_min_flags: int
    armed_weeks: int


class Rebuy(_Model):
    drawdown_from_ath: float
    mvrv_z_below: float
    tranches: int
    tranche_spacing_days: int


class EuphoriaActions(_Model):
    tiers: list[EuphoriaTier]
    backstop: Backstop
    rebuy: Rebuy
    pause_entries: bool
    reset_weeks: int


class Portfolio(_Model):
    mode: Literal["btc_sleeve", "usd_buckets"]
    initial_btc: float
    sleeve_frac: float


class Rebalance(_Model):
    weekday: int
    sell_excess_band: float
    min_trade_frac: float
    vault: Literal["two_way", "top_up_only"]
    vault_band: float
    vault_tax: Literal["long_term", "short_term"]


class BreakerL1(_Model):
    drawdown: float
    close_leverage: bool
    entry_freeze_days: int


class BreakerL2(_Model):
    drawdown: float
    force_regime: Regime


class Breakers(_Model):
    measure: Literal["usd", "btc"]
    level_1: BreakerL1
    level_2: BreakerL2
    defend_days: int
    rebase_after_fire: bool


class WalkForward(_Model):
    train_days: int
    test_days: int


class BacktestRules(_Model):
    fee_per_side: float
    slippage_per_side: float
    signal_at: Literal["close"]
    fill_at: Literal["close"]
    initial_usd: float
    delisted_haircut: float
    delisted_after_days: int
    walk_forward: WalkForward


class CycleAccount(_Model):
    fee_per_trade: float
    tax_rate: float


class CycleSell(_Model):
    target_frac: float
    window_start_days: int
    window_end_days: int
    clock_share: float
    clock_tranches: int
    trend_weekly_sma: int


class CycleBuy(_Model):
    start_days_since_ath: int
    start_drawdown: float
    start_mvrv_below: float
    tranches: int
    spacing_days: int
    deadline_days_since_ath: int


class CycleAlts(_Model):
    slice_days: list[int]
    max_rank: int


class Cycle(_Model):
    account: CycleAccount
    halvings: list[date]
    sell: CycleSell
    alts: CycleAlts
    buy: CycleBuy


class Rules(_Model):
    version: int
    universe: UniverseRules
    score: ScoreRules
    entry: EntryRules
    buckets: Buckets
    positions: Positions
    ladder: Ladder
    routing: Routing
    time_stop: TimeStop
    rotation: RotationRules
    leverage: LeverageRules
    regime: RegimeRules
    flags: FlagRules
    euphoria_actions: EuphoriaActions
    portfolio: Portfolio
    rebalance: Rebalance
    breakers: Breakers
    cycle: Cycle
    backtest: BacktestRules


class Ranking(_Model):
    volume_window_days: int
    min_volume_days: int
    min_turnover: float


class PegDetector(_Model):
    window_days: int
    max_range: float
    price_band: tuple[float, float]
    min_share_of_days: float


class Universe(_Model):
    exclude_categories: list[str]
    ranking: Ranking
    force_include_ids: list[str]
    peg_detector: PegDetector
    exclude_ids: list[str]
    meme_categories: list[str]
    meme_ids: list[str]
    leverage_symbols: dict[str, str]


class Config(_Model):
    rules: Rules
    universe: Universe
    config_hash: str


def _read_yaml(path: Path) -> dict:
    with path.open() as f:
        return yaml.safe_load(f)


def load_config(config_dir: Path = CONFIG_DIR) -> Config:
    rules_path = config_dir / "rules.yaml"
    universe_path = config_dir / "universe.yaml"

    digest = hashlib.sha256()
    for p in (rules_path, universe_path):
        digest.update(p.read_bytes())

    return Config(
        rules=Rules.model_validate(_read_yaml(rules_path)),
        universe=Universe.model_validate(_read_yaml(universe_path)),
        config_hash=digest.hexdigest()[:16],
    )


@cache
def get_config() -> Config:
    return load_config()
