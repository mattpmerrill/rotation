from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from rotation.config import CONFIG_DIR, REGIMES, load_config


def test_repo_config_loads():
    cfg = load_config()
    assert cfg.rules.version >= 1
    assert len(cfg.config_hash) == 16


def test_buckets_defined_for_every_regime():
    b = load_config().rules.buckets
    for regime in REGIMES:
        assert b.for_regime(regime).vault_btc > 0


def test_brief_bucket_targets():
    b = load_config().rules.buckets
    assert (
        b.expand.vault_btc,
        b.accumulate.vault_btc,
        b.euphoria.vault_btc,
        b.defend.vault_btc,
    ) == (
        0.35,
        0.50,
        0.50,
        0.60,
    )
    assert b.euphoria.leverage == 0.0


def test_leverage_off_by_default():
    assert load_config().rules.leverage.enabled is False


def _write_modified(tmp_path: Path, mutate) -> Path:
    raw = yaml.safe_load((CONFIG_DIR / "rules.yaml").read_text())
    mutate(raw)
    (tmp_path / "rules.yaml").write_text(yaml.safe_dump(raw))
    (tmp_path / "universe.yaml").write_text((CONFIG_DIR / "universe.yaml").read_text())
    return tmp_path


def test_bucket_weights_must_sum_to_one(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["buckets"]["expand"].update(vault_btc=0.40))
    with pytest.raises(ValidationError, match="sum to"):
        load_config(d)


def test_unknown_key_is_rejected(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["time_stop"].update(dayz=45))
    with pytest.raises(ValidationError):
        load_config(d)


def test_ladder_must_leave_a_runner(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["ladder"]["rungs"][2].update(sell=0.60))
    with pytest.raises(ValidationError, match="runner"):
        load_config(d)


def test_hash_changes_with_rules(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["time_stop"].update(days=30))
    assert load_config(d).config_hash != load_config().config_hash
