"""Parquet cache. One file per (dataset, key), e.g. data/binance_spot_1d/BTCUSDT.parquet.

The cache is rebuildable from source and never committed.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from rotation.config import REPO_ROOT


def data_dir() -> Path:
    return Path(os.environ.get("ROTATION_DATA_DIR") or REPO_ROOT / "data")


def path_for(dataset: str, key: str) -> Path:
    return data_dir() / dataset / f"{key}.parquet"


def read(dataset: str, key: str) -> pd.DataFrame | None:
    p = path_for(dataset, key)
    return pd.read_parquet(p) if p.exists() else None


def write(df: pd.DataFrame, dataset: str, key: str) -> Path:
    p = path_for(dataset, key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    df.to_parquet(tmp, index=False)
    tmp.replace(p)  # atomic: a crash never leaves a half-written file
    return p


def upsert(new: pd.DataFrame, dataset: str, key: str, on: str = "date") -> pd.DataFrame:
    """Merge `new` rows into the cached frame, newest value wins on key collisions."""
    old = read(dataset, key)
    merged = new if old is None else pd.concat([old, new], ignore_index=True)
    merged = merged.drop_duplicates(subset=on, keep="last").sort_values(on, ignore_index=True)
    write(merged, dataset, key)
    return merged
