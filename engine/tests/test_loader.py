"""The loader's data prep against the migration's schema (no database needed)."""

import re

import pytest

from rotation.config import REPO_ROOT, get_config
from rotation.data import cache
from rotation.data.loader import KEYS, _pg_array, prepare

MIGRATION = (REPO_ROOT / "supabase" / "migrations" / "20260924234140_market_data.sql").read_text()


def _schema_columns(table: str) -> set[str]:
    body = re.search(rf"create table public\.{table} \((.*?)\n\);", MIGRATION, re.DOTALL).group(1)
    cols = set()
    for line in body.splitlines():
        m = re.match(r"\s+([a-z_0-9]+)\s+\w", line)
        if m and m.group(1) not in {"primary", "constraint"}:
            cols.add(m.group(1))
    return cols


@pytest.mark.skipif(cache.read("universe", "ranks") is None, reason="needs the local data cache")
def test_prepared_tables_match_migration_columns_and_keys():
    tables = prepare(get_config(), since="2026-06-01")
    for name, df in tables.items():
        schema = _schema_columns(name)
        assert set(df.columns) <= schema, (name, set(df.columns) - schema)
        assert not df.duplicated(KEYS[name]).any(), name
    assert next(iter(tables)) == "coins"  # FK parents load first
    daily = tables["daily_prices"]
    assert daily["close"].notna().all()
    assert set(daily["coin_id"]) <= set(tables["coins"]["id"])


def test_pg_array_quotes():
    assert _pg_array(["Layer 1 (L1)", 'say "hi"']) == '{"Layer 1 (L1)","say \\"hi\\""}'


def test_normalize_dsn_encodes_password_up_to_the_last_at():
    from rotation.data.loader import normalize_dsn

    raw = "postgresql://postgres.ref:p@ss:w/rd@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
    assert normalize_dsn(raw) == (
        "postgresql://postgres.ref:p%40ss%3Aw%2Frd@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
    )
    already = "postgresql://postgres.ref:p%40ss@host:5432/postgres"
    assert normalize_dsn(already) == already  # already-encoded passwords are left as they are
