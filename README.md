# Rotation

A rules-based crypto portfolio system for growing BTC holdings by trading top-100 alts.
Read-only in v1: it scores, alerts and reports; it never places orders.

- Plan and decisions: [docs/PLAN.md](docs/PLAN.md)
- The rules in plain English: [docs/RULES.md](docs/RULES.md)
- Every threshold: [config/rules.yaml](config/rules.yaml)

## Engine quickstart

```sh
cp .env.example .env            # add a CoinGecko key
cd engine
uv sync
uv run pytest
uv run rotation config          # validate config, print its hash
uv run rotation fetch btc-onchain
uv run rotation fetch binance BTCUSDT ETHUSDT
```

Market data is cached as Parquet under `data/` (not committed).
