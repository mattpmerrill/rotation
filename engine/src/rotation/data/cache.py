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


def read_if_exists(dataset: str, key: str) -> pd.DataFrame | None:
    """The cached frame, or None if it was never written."""
    p = path_for(dataset, key)
    return pd.read_parquet(p) if p.exists() else None


def read(dataset: str, key: str) -> pd.DataFrame:
    """The cached frame. A missing file is an error that says where it should be."""
    frame = read_if_exists(dataset, key)
    if frame is None:
        raise FileNotFoundError(
            f"No cached {dataset}/{key} at {path_for(dataset, key)}. "
            "The cache is rebuilt by the engine's fetch, backfill, ranks and prices commands."
        )
    return frame


def write(df: pd.DataFrame, dataset: str, key: str) -> Path:
    p = path_for(dataset, key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    df.to_parquet(tmp, index=False)
    tmp.replace(p)  # atomic: a crash never leaves a half-written file
    return p


def upsert(new: pd.DataFrame, dataset: str, key: str, on: str = "date") -> pd.DataFrame:
    """Merge `new` rows into the cached frame, newest value wins on key collisions."""
    old = read_if_exists(dataset, key)
    merged = new if old is None else pd.concat([old, new], ignore_index=True)
    merged = merged.drop_duplicates(subset=on, keep="last").sort_values(on, ignore_index=True)
    write(merged, dataset, key)
    return merged
