# BTC cycle harvest: study

Generated 2026-09-24 23:55 UTC · regenerate with `uv run rotation cycle-report`.

**Goal (Matt, 2026-09-24):** grow the BTC count. Sell at least a third of the stack near each
cycle top into USDT, then deploy it back into BTC near the bear-market bottom. No round trips.
Scored in BTC: a cycle multiple of 1.10x means 10% more BTC at the next halving than at this one.
Fees 1.0% per trade; tax reserved at 0% of each sale's gain (0% shown for comparison).

## The rule

**Sell (from day `window_start` to `window_end` after each halving):** a share of the target
(`clock_share`) is sold in 4 evenly spaced tranches; the rest of the target is sold on the first
weekly close below the 20-week average after a new all-time high inside the window.

**Buy:** start deploying the USDT in 4 monthly tranches once BTC has gone `start_days_since_ath`
days without a new high, or is `start_drawdown` below it, or MVRV < 1. Deploy everything left
540 days after the high, or at once if BTC makes a new all-time high (the bottom was missed).

## Honest test: every cycle scored with settings chosen without it

Sell a third:

| held_out_cycle   | trained_on                         | held_out_multiple   |   window_start_days |   window_end_days |   clock_share |   start_days_since_ath |   start_drawdown |
|:-----------------|:-----------------------------------|:--------------------|--------------------:|------------------:|--------------:|-----------------------:|-----------------:|
| 2012-11-28       | 2016-07-09, 2020-05-11             | 1.163x              |                 500 |               580 |             1 |                    360 |              0.8 |
| 2016-07-09       | 2012-11-28, 2020-05-11             | 1.064x              |                 400 |               700 |             1 |                    360 |              0.7 |
| 2020-05-11       | 2012-11-28, 2016-07-09             | 1.488x              |                 500 |               580 |             1 |                    360 |              0.8 |
| 2024-04-19       | 2012-11-28, 2016-07-09, 2020-05-11 | 1.100x              |                 500 |               580 |             1 |                    360 |              0.8 |

Sell half:

| held_out_cycle   | trained_on                         | held_out_multiple   |   window_start_days |   window_end_days |   clock_share |   start_days_since_ath |   start_drawdown |
|:-----------------|:-----------------------------------|:--------------------|--------------------:|------------------:|--------------:|-----------------------:|-----------------:|
| 2012-11-28       | 2016-07-09, 2020-05-11             | 1.244x              |                 500 |               580 |             1 |                    360 |              0.8 |
| 2016-07-09       | 2012-11-28, 2020-05-11             | 1.536x              |                 400 |               700 |             1 |                    360 |              0.8 |
| 2020-05-11       | 2012-11-28, 2016-07-09             | 1.731x              |                 500 |               580 |             1 |                    360 |              0.8 |
| 2024-04-19       | 2012-11-28, 2016-07-09, 2020-05-11 | 1.151x              |                 500 |               580 |             1 |                    360 |              0.8 |

The last row of each table is a true forward test: settings chosen on 2012-2020 only, then applied
to the 2024 cycle (still in progress: its USDT is valued at today's price).

**Robustness:** of all 243 setting combinations tested, 67% beat holding in
every complete cycle. The worst complete cycle across all combinations ranged from
1.00x to 1.34x.

## With today's settings (chosen on 2012-2020), from the starting stack

Settings: window_start_days = 500, window_end_days = 580, clock_share = 1, start_days_since_ath = 360, start_drawdown = 0.8.

**Read these tables with care:** these settings were *picked because* they did best on
2012-2020, so the 2012, 2016 and 2020 rows below are in-sample and flatter than reality. The
honest numbers are the held-out table above. Only the 2024 row here is a genuine forward test.

![Cycle harvest](img/cycle-harvest.png)

Tax 0%:

| cycle      | complete   |   btc_start |   btc_end | multiple   |   usdt_left_at_end |
|:-----------|:-----------|------------:|----------:|:-----------|-------------------:|
| 2012-11-28 | True       |      11     |    12.79  | 1.163x     |        0           |
| 2016-07-09 | True       |      12.79  |    22.452 | 1.755x     |        0           |
| 2020-05-11 | True       |      22.452 |    33.4   | 1.488x     |        0           |
| 2024-04-19 | False      |      33.4   |    36.755 | 1.100x     |        1.22334e+06 |

Tax 15% (for comparison):

| cycle      | complete   |   btc_start |   btc_end | multiple   |   usdt_left_at_end |
|:-----------|:-----------|------------:|----------:|:-----------|-------------------:|
| 2012-11-28 | True       |      11     |    11.992 | 1.090x     |                  0 |
| 2016-07-09 | True       |      11.992 |    19.113 | 1.594x     |                  0 |
| 2020-05-11 | True       |      19.113 |    26.18  | 1.370x     |                  0 |
| 2024-04-19 | False      |      26.18  |    27.301 | 1.043x     |             831502 |

Selling half instead of a third (tax 0%):

| cycle      | complete   |   btc_start |   btc_end | multiple   |   usdt_left_at_end |
|:-----------|:-----------|------------:|----------:|:-----------|-------------------:|
| 2012-11-28 | True       |      11     |    13.685 | 1.244x     |        0           |
| 2016-07-09 | True       |      13.685 |    29.192 | 2.133x     |        0           |
| 2020-05-11 | True       |      29.192 |    50.545 | 1.731x     |        0           |
| 2024-04-19 | False      |      50.545 |    58.161 | 1.151x     |        2.77693e+06 |

### Every trade (sell a third, tax 0%)

| date       | side   |   btc |    usd |   tax |     px | reason      |
|:-----------|:-------|------:|-------:|------:|-------:|:------------|
| 2014-04-12 | sell   | 0.917 |    385 |     0 |    424 | clock_1     |
| 2014-05-02 | sell   | 0.917 |    410 |     0 |    452 | clock_2     |
| 2014-05-22 | sell   | 0.917 |    478 |     0 |    527 | clock_3     |
| 2014-06-11 | sell   | 0.917 |    573 |     0 |    631 | clock_4     |
| 2014-10-04 | buy    | 1.39  |    462 |     0 |    329 | tranche_1   |
| 2014-11-03 | buy    | 1.405 |    462 |     0 |    325 | tranche_2   |
| 2014-12-03 | buy    | 1.216 |    462 |     0 |    376 | tranche_3   |
| 2015-01-02 | buy    | 1.447 |    462 |     0 |    316 | tranche_4   |
| 2017-11-21 | sell   | 1.066 |   8539 |     0 |   8092 | clock_1     |
| 2017-12-11 | sell   | 1.066 |  17805 |     0 |  16873 | clock_2     |
| 2017-12-31 | sell   | 1.066 |  14690 |     0 |  13921 | clock_3     |
| 2018-01-20 | sell   | 1.066 |  13473 |     0 |  12768 | clock_4     |
| 2018-11-19 | buy    | 2.815 |  13627 |     0 |   4792 | tranche_1   |
| 2018-12-19 | buy    | 3.648 |  13627 |     0 |   3698 | tranche_2   |
| 2019-01-18 | buy    | 3.738 |  13627 |     0 |   3609 | tranche_3   |
| 2019-02-17 | buy    | 3.724 |  13627 |     0 |   3623 | tranche_4   |
| 2021-09-23 | sell   | 1.871 |  83094 |     0 |  44861 | clock_1     |
| 2021-10-13 | sell   | 1.871 | 106225 |     0 |  57349 | clock_2     |
| 2021-11-02 | sell   | 1.871 | 116738 |     0 |  63025 | clock_3     |
| 2021-11-22 | sell   | 1.871 | 104437 |     0 |  56384 | clock_4     |
| 2022-06-13 | buy    | 4.553 | 102623 |     0 |  22316 | tranche_1   |
| 2022-07-13 | buy    | 5.041 | 102623 |     0 |  20156 | tranche_2   |
| 2022-08-12 | buy    | 4.164 | 102623 |     0 |  24396 | tranche_3   |
| 2022-09-11 | buy    | 4.675 | 102623 |     0 |  21733 | tranche_4   |
| 2025-09-01 | sell   | 2.783 | 300330 |     0 | 108992 | clock_1     |
| 2025-09-21 | sell   | 2.783 | 317769 |     0 | 115321 | clock_2     |
| 2025-10-11 | sell   | 2.783 | 305698 |     0 | 110940 | clock_3     |
| 2025-10-19 | sell   | 2.783 | 299543 |     0 | 108707 | trend_break |

## Caveats

- **Four cycles.** Three complete, one in progress. That is enough to see a pattern, not to
  prove one. The halving clock worked for 2016, 2020 and 2024 tops (525-546 days after the
  halving) but the 2013 top came at 371 days: a cycle that breaks the pattern will hurt.
- **The rule is only as good as the next cycle resembling the last three.** The trend-break
  exit and the new-high redeploy are there so a broken pattern costs a slice of upside, not the
  stack.
- **Tax** depends on your cost basis and jurisdiction; this uses one flat rate on each sale's gain.
