> **Archived.** The analysis handoff that led to the 1 Bitty Challenge, written 2026-09-26 against
> repo commit `69795a7`. It is kept as the record of where the challenge rules and the research came
> from. The product decisions are in [PLAN.md](../../PLAN.md) and the engineering decisions in
> [decisions/](../../decisions/); where this page and those disagree, they win. Statements about "the
> current repo" describe the repo as of that date.

# Handoff: 1 BTC Alt Basket Challenge (from Joi, 2026-09-26)

Hey Claude. Joi here (Matt's assistant). Matt and I spent today on alt-basket analysis using
this repo's data, and he wants the web app rebuilt around it. This doc covers what he wants,
what the data says, and what in the current repo conflicts with it. **Read section 3 before
you write code.** Matt reviews the plan before any build starts, so bring him the plan first.

---

## 1. Matt's strategy (what changed)

**Strategy: "choose a basket of alts to hold for the bull run."**

- Each person swaps **up to 1 BTC** into an alt basket **now** (late Sep 2026, day ~890 after the
  Apr 2024 halving). The current plan says to wait for the ~Apr 2028 halving. Matt is choosing to
  start now.
- **Hold** through the bull run. No trading or rebalancing (monthly swaps hurt returns in every
  backtest).
- **Sell the alts for USDT near the alt top** and **hold the USDT**.
- **Wait for the next bear market**, then turn the USDT into as many BTC as possible.
- Score everything in **BTC**: did you end up with more than the 1 BTC you started with?

This is the **"1 BTC Challenge"** for Matt and three friends (a small group). Each person has their own account and basket, with a shared leaderboard.

---

## 2. What Matt wants the app to do

A simplified, well-organized, easy-to-use app:

1. **Separate logins** for Matt and each friend. Supabase Auth already exists (email/password
   + Google).
2. **Leaderboard** showing everyone's alt picks.
3. **Everyone's performance** from the day they bought in to today, in BTC terms (plus USD as a
   secondary number).
4. **1 BTC cap.** Each basket is funded with at most 1 BTC. Enforce this on save and on trade
   entry.
5. **Exit flow:** sell alts near the top, hold USDT, then rebuy BTC in the bear. The app should
   show which phase each person is in (Holding alts → Holding USDT → Back in BTC) and the final
   score in BTC.
6. **Alt basket picker.** Pick coins, check them against the rules (section 5), and preview how
   the pick did historically.
7. **Clean charts of past performance** for the chosen alts (and the basket as a whole) against
   BTC.
8. **Clean charts of the current basket's performance** since each person's buy date, in BTC and
   USD, per coin and total.
9. **Easy sell entry:** date, coin, amount (partial sells allowed), price auto-filled from that
   day's close and editable.
10. **Clean portfolio charts including USDT:** stacked area of alts + USDT (+ BTC after rebuy)
    over time, with BTC-equivalent as the headline number.

Design direction: simple and friendly, not a quant dashboard. One clear number per person ("1.00
BTC → 1.18 BTC"), with charts that tell the story at a glance. Should work well on a phone.

---

## 3. Conflicts with the current repo (resolve these, don't paper over them)

| Current repo | Matt's new direction | Suggested resolution |
|---|---|---|
| `docs/PLAN.md` decision 11: buy alts in 4 slices from the halving to +180 days (~Apr–Oct 2028). PLAN.md also warns that "alts bought at this point lost 24-32% against BTC." | Buy **now** and hold. | Matt's call; build what he asked for. **Show the risk honestly in the app** (see section 4, bad-cycle numbers). Add a PLAN.md decision row dated 2026-09-26 recording the change. Keep the engine's halving-clock BTC harvest untouched: it's a separate strategy for the BTC core. |
| `plans.basket` has `check (cardinality(basket) <= 5)` | Matt now wants a basket of **2–8** coins (5 recommended). | New migration: `cardinality(basket) between 2 and 8`. |
| RLS: plans and trades are strictly per person; nobody can see anyone else's. | The leaderboard shows everyone's picks and performance. | Add a `challenge_entries` table/view (or a `security definer` function) that exposes **only** display name, basket coins, buy date, and BTC-denominated performance to signed-in members. Keep trades private. Run the Supabase security advisor afterwards. |
| PLAN.md decision 10: Discord never shows amounts, only shares. | The leaderboard shows performance. | Compatible: everyone is capped at 1 BTC, so show multiples/percent (1.18x, +18%) rather than dollar amounts. Don't expose anyone's wider holdings. |
| App v1 = cycle clock, my plan, my stack, Basket Lab. | Leaderboard-first challenge app. | Reorganize nav: **Leaderboard (home, signed in) · My Basket · Basket Picker · Portfolio · Cycle Clock**. Log sells from My Basket / Portfolio. Keep the cycle clock as a secondary page. |
| Sell window = BTC halving clock (days 500–580, ~Aug–Nov 2029). | "Sell near the top of the bull market **for alts**." | Alts peaked **5–10 months before BTC** in both cycles tested (May 2021 vs Nov 2021; Dec 2024 vs Oct 2025). Selling on BTC's clock gave back about half the gains (Matt's first basket peaked at 7.4 BTC but was worth 3.99 at the BTC clock). Suggest an **alert, not an auto-sell**: "your basket/BTC ratio closed a week below its 20-week average after a new high." Matt still decides and logs the sell. |

---

## 4. The analysis (what we found)

### Method
- Data: `data/universe` prices + point-in-time ranks (CoinGecko Analyst backfill, 2016+),
  `load_features()` for BTC, sell tranche days from `config/rules.yaml` (`[500, 520, 540, 560]`
  days after the next halving).
- Entry: the same point in the cycle as today (day 886 after the halving) in the two previous
  cycles:
  - **Good cycle:** buy 2018-12-12, sell Sep–Nov 2021 (a big alt season)
  - **Bad cycle:** buy 2022-10-14, sell Sep–Oct 2025 (only BTC went up)
- Equal-weight, buy with 1 BTC, **1% fee each way** (the exchange's fee), hold, sell on the 4
  clock dates. Result = BTC at the end. Coins that died count as 0.
- The analysis scripts (per-coin table, named baskets, swaps, pool search, best basket per size)
  were scratch quality and were removed on 2026-09-28: they imported engine modules that were
  archived ([ADR-004](../../decisions/ADR-004-archive-cycle-harvest-engine.md)) and no longer run.
  They are in the git tag `archive/cycle-harvest-2026-09-28`.

### Headline findings
- At this point in the cycle, **only 2 of the top 100 alts beat BTC in the bad cycle** (OKB, SOL)
  and **14 of 100 in the good cycle**. Top-100 equal-weight: 0.76x (good) and 0.19x (bad).
- **Every basket tested lost BTC in the bad cycle.** The best realistic outcomes were ~0.76–0.83
  BTC. In the good cycle, baskets made 3–5x.
- Every basket fell to ~0.53–0.57 BTC at some point in the bad cycle.
- **ETH was a drag in both cycles**: 2.69x good, 0.54x bad. Removing ETH improved every basket.
- **Survivorship bias:** we picked coins that are still big today, so real results would be
  worse. With only two cycles and thousands of combos searched, some of the "best" edge is luck.

### Per-coin, 1 BTC → BTC at the clock sell (good / bad), coins available on the group's exchange
ETH 2.69/0.54 · XRP 0.22/0.94 · BNB 6.16/0.66 · SOL –/1.15 · DOGE 7.23/0.62 · BCH 0.37/0.87 ·
ADA 4.24/0.34 · LINK 7.65/0.50 · XLM 0.19/0.52 · ZEC 0.18/0.68 · LTC 0.48/0.35 · QNT 13.52/0.09 ·
VET 2.06/0.15 · HBAR –/0.57 · AVAX –/0.26 · AAVE –/0.63 · INJ –/1.03 · RENDER –/1.28 ·
FET –/0.98 · PENDLE –/13.27 (tiny then, not repeatable). "–" = coin didn't exist yet.

### Best basket per size (exchange pool, top 100, bad-cycle result ≥ 0.75 BTC)
| Coins | Basket | Good | Bad |
|---|---|---|---|
| 2 | LINK / SOL | 7.50 | 0.81 |
| 3 | BNB / LINK / SOL | 6.77 | 0.75 |
| 4 | DOGE / BCH / LINK / SOL | 4.98 | 0.77 |
| **5** | **XRP / BNB / SOL / DOGE / LINK** ← Matt's likely pick | **5.21** | **0.76** |
| 6 | + BCH | 4.24 | 0.77 |
| 7 | + BCH + ZEC | 3.56 | 0.76 |
| 8 | nothing kept ≥0.75; best: ETH/XRP/BNB/DOGE/BCH/ADA/LINK/SOL | 4.00 | 0.69 |

Why 5 is recommended: 2–3 coins look better but are really single-coin bets (SOL didn't exist in
the good cycle; "QNT/SOL" scored 13.25 good but QNT then fell to 0.09x). Five was where adding
coins stopped helping.

### Other baskets tested (for the picker's presets / leaderboard context)
| Basket | Good | Bad |
|---|---|---|
| Matt's first idea: ETH/SOL/BNB/SUI/XRP/DOGE | 3.99 | 0.77 |
| Top-6 by cap: ETH/BNB/XRP/SOL/TRX/DOGE | 3.29 | 0.78 |
| ETH/BNB/SOL/HYPE/OKB/LINK | 4.49 | 0.90 |
| BNB/XRP/SOL/DOGE/BCH (smallest loss) | 3.43 | 0.83 |

(OKB and TRX are **not** available on the exchange, so they're out.)

### Where coins sit now vs their best-ever price in BTC (2026-09-22)
HYPE 0.97 (at the top) · OKB 0.60 · BNB 0.48 · SOL 0.33 · TRX 0.26 · ETH 0.22 · SUI 0.16 ·
DOGE 0.10 · LINK 0.09 · XRP 0.08 · AVAX 0.05 · ADA 0.04.

---

## 5. Picker rules (suggested, confirm with Matt)

- 2–8 coins, equal weight by default (custom weights optional, must sum to 100%).
- Each coin must be **top 100 by market cap on the buy date** (`daily_prices` / live ranks; the
  picker already validates against `coins` in commit `69795a7`).
- **Exclude** BTC, stablecoins, wrapped/staked tokens, exchange-only IOUs.
- Exchange availability: the group trades on one exchange. Its list (help center, ~90 coins,
  checked 2026-09-26) includes ETH, XRP, BNB, SOL, DOGE, BCH,
  ADA, HYPE, LINK, XLM, HBAR, ZEC, LTC, AVAX, SHIB, SUI, TON, CRO, DOT, UNI, AAVE, NEAR, ONDO, ICP,
  ATOM, POL, QNT, ALGO, RENDER, FIL, APT, VET, ARB, INJ, TIA, LDO and more. It does **not**
  include TRX or OKB. A per-person "my exchange" availability filter would be nice but isn't
  required; the friends may use other exchanges.
- Show a warning (not a block) for coins with no bear-market history or at their all-time high
  vs BTC.
- Preview: run the section 4 method on the pick and show good/bad cycle results, the lowest point
  along the way, and a chart against holding BTC.

---

## 6. Suggested data model additions (sketch, adjust to taste)

- `challenge_entries`: user_id, display_name (from profiles), started_on, btc_committed (≤ 1),
  basket (text[] 2–8), weights (numeric[]), status (`holding_alts` | `holding_usdt` | `back_in_btc`).
- Keep `trades` as the source of truth (it already has `buy/sell/deposit/withdraw` and derives
  USDT legs via the `holdings` view). Buy-in = alt buys funded by a BTC sell on `started_on`.
- `leaderboard` (security-definer view/function): per entry, current value in BTC and USD, the
  multiple vs 1 BTC, best/worst so far, phase. Readable by signed-in members only.
- Daily job (GitHub Action already exists): price everyone's held coins + BTC into
  `daily_prices` (commit `d116d65` already covers the top 250 + basket/held coins), then snapshot
  a `portfolio_daily` per user so charts are fast.

---

## 7. What NOT to change

- `config/rules.yaml`, the engine's cycle-harvest rules, and their tests. This challenge sits
  **alongside** the BTC core strategy. If a threshold changes, bump the version and log it in
  `CHANGELOG-RULES.md`.
- The existing RLS isolation on `trades` and `plans`.
- Secrets stay in `.env` / Vercel / GitHub secrets.

## 8. Open questions for Matt (ask, don't assume)

1. Do the friends log their own trades, or does Matt enter them?
2. Leaderboard: show USD values, or BTC multiples only?
3. Should the "alt top" alert go to Discord too, or stay in the app only?
4. After the USDT → BTC rebuy, is the challenge "done", or does it roll into the next cycle?

— Joi 💋 (analysis run 2026-09-26 against repo HEAD `69795a7`; BTC ≈ $84,100)
