"""One-time CoinGecko history backfill for every coin, active and dead.

Point-in-time top-100 needs market caps for every coin that could have ranked on
any day, and we can't know which ones those are without fetching them. So we
fetch all of them (~58k calls, about 12% of an Analyst month) and keep only
rows that could matter for ranking.

Resumable: coins are written in shards, then recorded in _done.txt. A crash
between the two just means a coin gets fetched twice; readers dedupe on
(coin_id, date).
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime

import pandas as pd

from rotation.data import cache
from rotation.data.coingecko import CoinGecko

log = logging.getLogger(__name__)

DATASET = "coingecko_backfill"


def _dir():
    d = cache.data_dir() / DATASET
    d.mkdir(parents=True, exist_ok=True)
    return d


def done_ids() -> set[str]:
    p = _dir() / "_done.txt"
    return set(p.read_text().split()) if p.exists() else set()


def _flush(frames: list[pd.DataFrame], ids: list[str]) -> None:
    d = _dir()
    if frames:
        shard = d / f"part-{time.time_ns()}.parquet"
        pd.concat(frames, ignore_index=True).to_parquet(shard, index=False)
    with (d / "_done.txt").open("a") as f:
        f.write("".join(f"{i}\n" for i in ids))


def run(
    start: datetime = datetime(2016, 1, 1, tzinfo=UTC),
    min_market_cap: float = 1_000_000,
    workers: int = 8,
    shard_size: int = 500,
    limit: int | None = None,
) -> None:
    cg = CoinGecko()
    if cg.plan != "pro":
        raise RuntimeError("backfill needs a paid key: set COINGECKO_PLAN=pro")

    lists = []
    for status in ("active", "inactive"):
        df = cg.coins_list(status)
        df["status"] = status
        lists.append(df)
    coins = pd.concat(lists, ignore_index=True).drop_duplicates("id")
    coins.to_parquet(_dir() / "_coins.parquet", index=False)

    done = done_ids()
    todo = [c for c in coins["id"] if c not in done][:limit]
    log.info("coins %d, already done %d, to fetch %d", len(coins), len(done), len(todo))

    end = datetime.now(UTC)
    frames: list[pd.DataFrame] = []
    finished: list[str] = []
    n_ok = n_kept = n_fail = 0
    t0 = time.monotonic()

    def fetch(cid: str) -> pd.DataFrame:
        df = cg.market_chart(cid, start, end)
        # Keep rows that could matter for a top-100 rank. $1M is far below the #100
        # cap on any day since 2016, so nothing rankable is dropped.
        return df[df["market_cap_usd"] >= min_market_cap].assign(coin_id=cid)

    with ThreadPoolExecutor(workers) as ex:
        futures = {ex.submit(fetch, cid): cid for cid in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            cid = futures[fut]
            try:
                df = fut.result()
            except Exception as e:  # noqa: BLE001 - one bad coin must not kill the run; retried next run
                n_fail += 1
                log.warning("failed %s: %s", cid, e)
                continue  # not marked done -> retried next run
            n_ok += 1
            if len(df):
                n_kept += 1
                frames.append(df)
            finished.append(cid)
            if len(finished) >= shard_size:
                _flush(frames, finished)
                frames, finished = [], []
            if i % 1000 == 0:
                rate = i / (time.monotonic() - t0) * 60
                eta = (len(todo) - i) / rate if rate else 0
                log.info(
                    "%d/%d  kept %d  failed %d  %.0f/min  eta %.0f min",
                    i,
                    len(todo),
                    n_kept,
                    n_fail,
                    rate,
                    eta,
                )
    _flush(frames, finished)
    log.info("done: fetched %d, with rankable data %d, failed %d", n_ok, n_kept, n_fail)


def load() -> pd.DataFrame:
    """All backfilled rows, deduplicated."""
    parts = sorted(_dir().glob("part-*.parquet"))
    df = pd.concat((pd.read_parquet(p) for p in parts), ignore_index=True)
    return df.drop_duplicates(["coin_id", "date"], keep="last").reset_index(drop=True)
