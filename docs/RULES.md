# Rules in plain English (research engine)

> **Archived.** The original Phase 0 rule engine. Its code was removed from `main` on 2026-09-28
> ([ADR-004](decisions/ADR-004-archive-cycle-harvest-engine.md)) and lives on in the git tag
> `archive/cycle-harvest-2026-09-28`. Only the halving clock and BTC cycle features survive, in
> `engine/src/rotation/rules/cycle.py`. This page is the record of the rules; the studies it produced
> are in the tag. The live app is the 1 Bitty Challenge: see [PLAN.md](PLAN.md).

The source of truth is `config/rules.yaml`; this page explains it. Items tagged
**[default]** are definitions the program doc left open. Beck proposed them; Matt
reviews them. Change the number in the config, not the code.

All gains are measured in USD from the average entry price. All performance is
reported in both BTC and USD.

## 1. Universe gates (all must pass)

- CoinGecko top 100 on that day, excluding stablecoins, wrapped and liquid-staking tokens.
- $20M+ average daily volume over 30 days **[default: 30-day window]**, on 2+ of
  Binance, Coinbase, Kraken, OKX, Bybit **[default: that exchange list]**.
- Under 3% of supply unlocking in the next 90 days. *Live only: no free history.*
- 12+ months of price history.
- ALT/BTC above its 50D SMA, **or** making higher lows. **[default: higher lows = the
  last 2 swing lows on ALT/BTC in the past 90 days each higher than the one before; a
  swing low is the lowest close within 5 days either side.]**
- A one-line catalyst (manual). *Ignored in backtests.*

## 2. Entry score (0-5, one point each)

| Point | Passes when |
|---|---|
| Trend | price > 50D SMA and 50D SMA > 200D SMA |
| Beating BTC | ALT/BTC > its 50D SMA and ALT/BTC today > 10 days ago **[default: 10 days]** |
| Location | within 20% of the 20D SMA and near support **[default: close within 10% above the 30-day low]** |
| Not crowded | funding <= 0.01%/8h and open interest up < 30% over 7 days |
| Flow | 7D average volume > 30D average **[default]**, or the manual smart-money/catalyst flag |

4+ = full size, 3 = half size, 2 or less = pass. Reward-to-risk must be 3+.

**Stop and target [default]** (needed for reward-to-risk, rotation and leverage):
- Initial stop: 2% below the 30-day low, never more than 25% below entry.
- Target: the highest high of the last 365 days above the current price; if price is
  already at the high, +100% (the top ladder rung).

## 0. Portfolio design (Matt, 2026-09-24)

- **Core:** 90% of your BTC (e.g. 9.9 of 11). Never sold to rebalance. It grows from routed
  alt profits, and the cycle-top exit (rule 10) can move part of it to stables and rebuy lower.
- **Alt sleeve:** 10% (1.1 BTC). Runs every rule below. Its idle money is held as BTC, not
  dollars. If it loses, it is not topped up from the core: the most you can lose to the alt
  experiment is the sleeve.
- **Scorecard:** total BTC, net of the tax reserve.

The bucket table in section 3 applies **inside the sleeve**: Vault and leverage rows drop
out and the rest is re-scaled to 100% (e.g. Expand: 36% large, 27% mid, 18% small, 18% dry
powder). Position limits (max 10, 10% each, trim at 15%) are percentages of the sleeve.
Circuit breakers watch the sleeve's value.

## 3. Buckets

| | Expand | Accumulate | Euphoria | Defend |
|---|---|---|---|---|
| Vault BTC | 35% | 50% | 50% | 60% |
| Large caps (rank 1-20) | 20% | 15% | 10% | 5% |
| Mid caps (21-50) | 15% | 10% | 5% | 0% |
| Small caps (51-100) | 10% | 5% | 0% | 0% |
| Dry powder | 10% | 15% | 35% | 30% |
| Leverage (collateral) | 10% | 5% | 0% | 5% |

**[default: size tiers by rank 1-20 / 21-50 / 51-100.]** Max 10 positions, max 10% in
any one alt, trim back to 10% if it reaches 15%.

## 4. Profit ladder

Sell fractions are of the **original** position.

| Gain (USD) | Sell | Move stop to |
|---|---|---|
| +30% | 20% | break-even |
| +60% | 20% | +25% |
| +100% | 25% | +50% |

The remaining 35% (the runner) exits on the first daily close below the 20D SMA, or
when price falls 25% off its high since entry.

## 5. Profit routing

First, 30% of net short-term realized gain goes to the tax reserve. The rest: 50% to
the BTC Vault, 25% to dry powder, 25% recycled into new entries.

## 6. Time stop

After 45 days, if the position is up less than 10% **and** its score is below 3, exit.

## 7. Rotation

Rotate from A to B when `U_B * S_B / 5 - U_A * S_A / 5 > fees% + tax% + 10`, where U is
the % upside to the next target and S is the score. Never rotate out of a position that
scores 4+ and is in a trend.

## 8. Leverage (off until backtested)

Max 3x, isolated margin, longs only on BTC/ETH/SOL at score 5. Risk 1% of the portfolio
per trade; size = risk / stop distance. Liquidation must be at least 2x as far away as
the stop. Max 2 open.

## 9. Regime (weekly, Sunday UTC close; first match wins)

1. **Euphoria:** 3+ overheating flags.
2. **Defend:** BTC weekly close below its 200D SMA while that SMA is falling (lower than
   20 days ago), or the -25% circuit breaker has fired.
3. **Expand:** BTC above its 200D SMA, BTC dominance lower than 30 days ago, and 50%+ of
   the universe has ALT/BTC above its 50D SMA.
4. **Accumulate:** everything else.

## 10. Overheating flags (8)

| Flag | Fires when |
|---|---|
| MVRV Z | > 5 |
| Mayer Multiple | BTC / 200D SMA > 2.2 |
| Funding | BTC and ETH funding > 0.05%/8h for 14 straight days |
| Altcoin Season | > 75. Computed in-house: % of the top 50 that beat BTC over 90 days |
| Dominance | BTC dominance down 8+ points in 60 days (dominance computed from our top-100 market caps) |
| Retail mania | manual toggle |
| Memes | 3+ meme coins in the top 20 |
| BTC weekly RSI | 14-week RSI > 85 |

Actions: 3 flags = sell 25% of alts. 5 flags = sell 50% of the remaining alts and move
20% of the Vault to stables. 6+ flags, or a weekly close below the 20-week SMA after 3+
flags = exit all alts and move another 20% of the Vault to stables.

Rebuy BTC in 4 tranches once BTC is down 50%+ from its all-time high and MVRV Z < 1,
**[default: one tranche every 14 days while both hold]**.

## 11. Circuit breakers

Measured from the portfolio's peak value in USD **[default: USD]**.
- -15%: close all leverage, freeze new entries for 7 days.
- -25%: force Defend.

## Backtest conventions

Signals on the daily close, fills at the next day's open. 0.3% fee plus 0.1% slippage
**[default]** per side. Walk-forward: 2-year train, 6-month test windows.

## Defaults added while building Phase 0

The program doc left these open; the engine needs an answer. Each is a number in
`config/rules.yaml` marked `# DEFAULT`. Review and change freely.

| Area | Default | Why it was needed |
|---|---|---|
| Not crowded, no perp market | passes | Coins with no perps have no leveraged crowd; with funding but no OI history, judged on funding alone |
| BTC+ETH funding flag | the average of the two, above 0.05%/8h on each of the last 14 days | "BTC+ETH funding" was ambiguous |
| Backstop "after 3+ flags" | 3+ flags seen within the last 26 weeks | "after" needed a window |
| After a euphoria sale | no new alt buys until 8 straight weeks below 3 flags | otherwise the weekly rebalance buys the alts straight back |
| Weekly rebalance | Sundays; a bucket more than 5 pts over target sells lowest scores first; trades under 0.5% of the portfolio skipped | bucket targets needed an enforcement rule |
| **Vault rebalance** | **two-way (OPEN QUESTION)**: trim the Vault back to target when 5+ pts over | see the Phase 0 report: this choice dominates results |
| Vault sales | reserve tax at the long-term rate | Vault BTC is usually held a year+ |
| Long-term gains | 15% reserve on positions held 365+ days | the doc only gave a short-term rate |
| Circuit breaker level 2 | forced Defend for 7 days, then the peak re-bases | as first written it latched Defend for years |
| Rotation upside U | upside to the next ladder rung (candidate: +30%; runner: 0) | the entry target made rotation churn 728 times |
| Rotation churn guards | max 1 rotation a week; don't rotate out of anything held under 14 days | |
| Re-entry cooldown | 7 days after fully exiting a coin | prevented 33 same-day stop-and-rebuy whipsaws |
| Leverage liquidation | 0.5% maintenance margin in the liquidation price | needed to apply "liquidation >= 2x stop distance" |
| Backtest: dead coins | exit at last price minus 30% once data stops for 7 days | pessimistic on purpose |
| Backtest: fills | at the signal day's close | crypto trades 24/7; Binance's next open equals the prior close (median gap 0.000%) |
