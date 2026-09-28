# Rotation: plan

**The 1 Bitty Challenge: how many BTC can we get from one?** Each member swaps up to 1 BTC into a
basket of 2 to 8 alts, when they choose. They hold through the bull run, sell the alts for USDT
near the top, and rebuy BTC in the bear. Everything is scored in BTC: BTC out divided by BTC in.
The challenge ends when everyone has rebought; then the next one can start.

Players: Matt and the Boyz (Wrenny, Braav, Jumes). The app tells no one when to trade: it shows
where everyone stands, the history, and reference dates. People place their own trades on their
own exchange and log them.

Owner: Matt. Architect: Beck. Last updated 2026-09-26.

- How it's built: [architecture.md](architecture.md). How to change it: [../CONTRIBUTING.md](../CONTRIBUTING.md).
- App: https://rotation-web-seven.vercel.app (Vercel project `rotation-web`, root `web/`).

## What the research says (read before picking)

From 1 BTC, 1% fee per trade, using the two cycles the alt data covers
(`docs/backtests/challenge-exits.md`, Joi's analysis in `docs/handoff/`):

- **Buying alts at this point in the cycle lost BTC in the last cycle, whatever the basket.**
  In 2022-25 every basket tested ended at about 0.5-0.8 BTC at the old sell window. In
  2018-21 hand-picked baskets made 4-5x, but the top 5 or 10 coins picked at the time lost
  BTC in 5 of 6 cases. The big numbers come from hindsight.
- **No "sell the alts now" alert beat simply selling in the old window** (days 500-580 after
  the halving). Trend alerts sold early in 2018-21 and gave back most of the gain. So the app
  has no sell alert; it shows the window as a reference.
- **The extra BTC comes from the rebuy.** Selling near the top and rebuying BTC in the bear
  multiplied every 2018 basket by about 2.5x, and 1 BTC with no alts at all did the same
  (0.97 → 2.46). The app alerts when the bear rebuy window opens.

## Decisions

| # | Decision | Date |
|---|---|---|
| 1 | Profit ladder triggers in USD. *(Superseded by 11.)* | 2026-09-23 |
| 2 | Regime order Euphoria > Defend > Expand > Accumulate. *(Research engine only.)* | 2026-09-23 |
| 3 | Leverage off. | 2026-09-23 |
| 4 | Repo `~/Work/rotation`, private on `mattpmerrill` GitHub. | 2026-09-23 |
| 5 | Custom daily-step simulator, so backtests and live rules share functions. | 2026-09-23 |
| 6 | pandas only; backtests read Parquet, Postgres holds what the app reads. | 2026-09-23 |
| 7 | BTC core + alt sleeve instead of USD-weighted buckets. *(Superseded by 13.)* | 2026-09-24 |
| 8 | BTC cycle harvest as the primary strategy; Supabase project `rotation` (ref `xtccrljmxtjmxbosczrd`, free 21 Stacks org). *(Strategy superseded by 13; the project stays.)* | 2026-09-24 |
| 9 | Matt's BTC is in an IRA: no tax, 1% fee per trade (`config/rules.yaml` `cycle.account`). | 2026-09-24 |
| 10 | Discord never shows holdings or amounts. | 2026-09-24 |
| 11 | 10 BTC core + 1 BTC alt basket on the halving clock. *(Superseded by 13.)* | 2026-09-25 |
| 12 | Each person picks their own coins. | 2026-09-25 |
| 13 | **The app is only the 1 Bitty Challenge.** No schedule: each person chooses when to buy in, sell and rebuy. The halving clock and old sell window are shown as references only. The BTC-core plan pages and tables are retired. | 2026-09-26 |
| 14 | Baskets of 2 to 8 coins (5 suggested), each in the top 100 on the buy-in day. Up to 1 BTC per person. | 2026-09-26 |
| 15 | Members only (`profiles.is_member`, set by Matt). Members see each other's baskets and trades; each person edits only their own. | 2026-09-26 |
| 16 | Players log their own trades. | 2026-09-26 |
| 17 | Amounts in BTC by default, one tap to USD. | 2026-09-26 |
| 18 | Discord gets buy-ins, sells, rebuys, Sunday standings and the rebuy-window alert. No sell alert (research: none beat the clock). | 2026-09-26 |
| 19 | A challenge ends when every entry is back in BTC; then the next one opens. | 2026-09-26 |
| 20 | Name: **1 Bitty Challenge**. | 2026-09-26 |
| 21 | Picker previews include coins that weren't trading yet: their share waits in BTC and buys in at the coin's first weekly price. | 2026-09-26 |
| 22 | A "Joi's top picks" tab: five baskets that did best in past cycles, with why, computed by the same code as the picker. | 2026-09-26 |
| 23 | **Waiting slots**: some of a basket's 2-8 picks can wait as BTC and be filled later with any top-100 coin, until rebuying starts. A fill sells exactly one slot's share. Trades now have kinds (buy_in, fill, sell, rebuy); people log only sells and rebuys, so alts can't be bought outside the buy-in and fills. | 2026-09-26 |
| 24 | A "Best time to buy" tab: how buying alts went by point in the cycle (top 10 at the time, and per coin), with an indicator for today (`docs/backtests/buy-timing.md`). | 2026-09-26 |

## Running a challenge

- **Add a player:** they sign up in the app, then in Supabase:
  `update profiles set is_member = true where id = (select id from auth.users where email = '...');`
- **Open the next challenge** (after everyone has rebought):
  `update challenges set closed_on = current_date where closed_on is null;`
  `insert into challenges (name, opened_on) values ('1 Bitty Challenge', current_date);`
- **Fix a bad trade:** the player deletes it and logs it again. Buy-in trades can't be deleted in
  the app; fix those in SQL.

## Next

- Invite Wrenny, Braav and Jumes; set them as members.
- Supabase Auth URL settings and the Google sign-in client, if Google sign-in is wanted.
- Later, if wanted: an admin page for members and challenges (today it's SQL), and an
  "available on my exchange" filter in the picker.

## Data

| Need | Source | Cost |
|---|---|---|
| BTC price, MVRV | CoinMetrics Community API | free |
| Daily prices and ranks (top 250 + held coins) | CoinGecko Demo | free |
| Point-in-time history since 2016 (research, picker preview) | CoinGecko Analyst backfill, cached | one month, $129 (done) |

Data gotchas: Binance reuses tickers (LUNAUSDT); CoinGecko's 2017-18 daily prices are noisy;
CoinGecko has impossible market caps on dead markets; CoinMetrics publishes MVRV about a day late.

## History

Phase 0 (2026-09-23 to 09-25) built the data, a rule engine for the original program doc and the
backtests (`docs/backtests/phase0-report.md`: the original alt-trading rules lost BTC;
`docs/backtests/cycle-harvest.md`: the BTC cycle harvest). That engine stays in the repo as
research, tested and switched off. `docs/RULES.md` describes it.
