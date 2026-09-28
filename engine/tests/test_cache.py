"""The Parquet cache: a missing file is an error that says where it should be."""

import pandas as pd
import pytest

from rotation.data import cache


def test_read_raises_a_helpful_error_when_nothing_was_cached(tmp_path, monkeypatch):
    monkeypatch.setenv("ROTATION_DATA_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match=r"No cached universe/ranks at .*ranks\.parquet"):
        cache.read("universe", "ranks")
    assert cache.read_if_exists("universe", "ranks") is None


def test_write_then_read_round_trips(tmp_path, monkeypatch):
    monkeypatch.setenv("ROTATION_DATA_DIR", str(tmp_path))
    frame = pd.DataFrame(
        {"date": pd.to_datetime(["2026-09-01", "2026-09-02"]), "close": [1.0, 2.0]}
    )
    cache.write(frame, "demo", "prices")
    pd.testing.assert_frame_equal(cache.read("demo", "prices"), frame)


def test_upsert_lets_the_newest_value_win(tmp_path, monkeypatch):
    monkeypatch.setenv("ROTATION_DATA_DIR", str(tmp_path))
    day = pd.Timestamp("2026-09-01")
    cache.upsert(pd.DataFrame({"date": [day], "close": [1.0]}), "demo", "prices")
    merged = cache.upsert(pd.DataFrame({"date": [day], "close": [9.0]}), "demo", "prices")
    assert len(merged) == 1 and merged.loc[0, "close"] == 9.0
