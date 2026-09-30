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

import yaml
from pydantic import BaseModel, ConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = REPO_ROOT / "config"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --- cycle --------------------------------------------------------------------


class CycleSell(_Model):
    window_start_days: int
    window_end_days: int
    clock_tranches: int
    trend_weekly_sma: int


class CycleBuy(_Model):
    start_days_since_ath: int
    start_drawdown: float
    start_mvrv_below: float
    tranches: int
    spacing_days: int
    deadline_days_since_ath: int


class Cycle(_Model):
    halvings: list[date]
    sell: CycleSell
    buy: CycleBuy


class Rules(_Model):
    version: int
    cycle: Cycle


# --- universe (config/universe.yaml) ------------------------------------------


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
