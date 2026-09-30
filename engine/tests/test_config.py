from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from rotation.config import CONFIG_DIR, load_config


def test_repo_config_loads():
    cfg = load_config()
    assert cfg.rules.version >= 1
    assert len(cfg.config_hash) == 16


def _write_modified(tmp_path: Path, mutate) -> Path:
    raw = yaml.safe_load((CONFIG_DIR / "rules.yaml").read_text())
    mutate(raw)
    (tmp_path / "rules.yaml").write_text(yaml.safe_dump(raw))
    (tmp_path / "universe.yaml").write_text((CONFIG_DIR / "universe.yaml").read_text())
    return tmp_path


def test_unknown_key_is_rejected(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["cycle"]["sell"].update(dayz=45))
    with pytest.raises(ValidationError):
        load_config(d)


def test_hash_changes_with_rules(tmp_path):
    d = _write_modified(tmp_path, lambda r: r["cycle"]["buy"].update(spacing_days=31))
    assert load_config(d).config_hash != load_config().config_hash
