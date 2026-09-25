"""Top-5 alt sleeve on the halving clock vs keeping the sleeve in BTC.

1.1 BTC sleeve, each halving cycle scored separately and chained.
  Enter alts on the halving day (or on a signal), sell the whole sleeve into USDT on the
  same halving clock as the core (days 500-580, 4 tranches, trend-break sells the rest),
  then rebuy BTC with the core's buy rules. Result: sleeve BTC at the next halving.
"""

import numpy as np
import pandas as pd

from rotation.backtest.cycle_study import HALVINGS, load_features
from rotation.config import get_config
from rotation.data import cache
from rotation.rules.cycle import buy_started, clock_tranche_days, rules_from_config

FEE = 0.01
DEAD_HAIRCUT = 0.30
SELL, BUY = rules_from_config(get_config().rules.cycle)
SELL_DAYS = clock_tranche_days(SELL)

f = load_features()
px = cache.read("universe", "prices")
wide = px.pivot_table(index="date", columns="coin_id", values="price_usd").sort_index()
wide = wide.reindex(f.index)
ranks = cache.read("universe", "ranks")
top5 = ranks[ranks["rank"] <= 5].groupby("date")["coin_id"].apply(list)
last_seen = px.groupby("coin_id")["date"].max()
END = f.index[-1]


def basket_btc_index():
    """Daily value in BTC of an equal-weight point-in-time top-5 basket (monthly recon)."""
    val, out, hold, lastp = 1.0, [], {}, {}
    for t in f.index:
        if t < pd.Timestamp("2016-01-20"):
            out.append(np.nan)
            continue
        row = wide.loc[t]
        for c in hold:
            if not np.isnan(row.get(c, np.nan)):
                lastp[c] = row[c]
        if hold:
            val = sum(q * lastp[c] for c, q in hold.items()) / f.loc[t, "btc"]
        if (not hold or t.day == 1) and t in top5.index:
            cs = [c for c in top5[t] if not np.isnan(row.get(c, np.nan))]
            usd = val * f.loc[t, "btc"]
            hold = {c: usd / len(cs) / row[c] for c in cs}
            lastp.update({c: row[c] for c in cs})
        out.append(val)
    return pd.Series(out, index=f.index)


idx = basket_btc_index()
wk = idx.resample("W-SUN").last()
alt_on_wk = wk > wk.rolling(20).mean()
alt_on = alt_on_wk.reindex(f.index, method="ffill").fillna(False)


def run(h, h_next, sleeve_btc, mode):
    """mode: btc_hold | btc_clock | top5_static | top5_monthly | top5_signal | eth"""
    days = f.loc[h:h_next].index if h_next else f.loc[h:].index
    if h_next:
        days = days[:-1]
    btc, usd, alts, lastp = sleeve_btc, 0.0, {}, {}
    sold_idx, trend_done, armed, deploy, tr, last_buy = set(), False, False, 0.0, 0, None
    trades = 0

    def alt_usd(t):
        row = wide.loc[t]
        v = 0.0
        for c, q in list(alts.items()):
            p = row.get(c, np.nan)
            if not np.isnan(p):
                lastp[c] = p
            if t - last_seen[c] > pd.Timedelta(days=7):  # dead coin
                v_dead = q * lastp[c] * (1 - DEAD_HAIRCUT)
                alts.pop(c)
                nonlocal_usd[0] += v_dead
                continue
            v += q * lastp[c]
        return v

    nonlocal_usd = [0.0]

    def buy_alts(t, usd_amt, coins):
        row = wide.loc[t]
        cs = [c for c in coins if not np.isnan(row.get(c, np.nan))]
        for c in cs:
            alts[c] = alts.get(c, 0) + usd_amt * (1 - FEE) / len(cs) / row[c]
            lastp[c] = row[c]

    def sell_alts_frac(t, frac):
        nonlocal usd
        v = alt_usd(t)
        for c in list(alts):
            alts[c] *= 1 - frac
        usd += v * frac * (1 - FEE)

    def coins_now(t):
        if mode == "eth":
            return ["ethereum"]
        s = top5[:t]
        return s.iloc[-1] if len(s) else []

    in_alts_mode = mode.startswith("top5") or mode == "eth"
    for t in days:
        p = f.loc[t, "btc"]
        dsh = f.loc[t, "days_since_halving"]
        usd += nonlocal_usd[0]
        nonlocal_usd[0] = 0.0
        pre_window = dsh < SELL.window_start_days
        # --- alt phase (before the sell window) ---
        if in_alts_mode and pre_window:
            want = mode != "top5_signal" or alt_on.loc[t]
            if usd > 1 and deploy == 0 and not alts:
                pass
            if want and btc > 0 and not alts and usd < 1:
                buy_alts(t, btc * p, coins_now(t))
                btc, trades = 0.0, trades + 1
            elif not want and alts:
                sell_alts_frac(t, 1.0)
                btc += usd * (1 - FEE) / p
                usd, trades = 0.0, trades + 1
            elif mode == "top5_monthly" and alts and t.day == 1:
                v = alt_usd(t)
                alts.clear()
                buy_alts(t, v * (1 - FEE), coins_now(t))  # ~full turnover: conservative
        # --- sell window: whole sleeve to USDT ---
        if SELL.window_start_days <= dsh <= SELL.window_end_days and mode != "btc_hold":
            if f.loc[t, "days_since_ath"] == 0:
                armed = True
            for i, d in enumerate(SELL_DAYS):
                if dsh >= d and i not in sold_idx:
                    sold_idx.add(i)
                    frac = 1 / (len(SELL_DAYS) - i)
                    if alts:
                        sell_alts_frac(t, frac)
                    usd += btc * frac * p * (1 - FEE)
                    btc *= 1 - frac
            if armed and not trend_done and f.loc[t, "weekly_below_sma"]:
                trend_done = True
                if alts:
                    sell_alts_frac(t, 1.0)
                usd += btc * p * (1 - FEE)
                btc = 0.0
        # --- rebuy BTC after the window ---
        if usd > 1 and dsh > SELL.window_end_days:
            row = f.loc[t]
            if deploy == 0 and buy_started(row, BUY):
                deploy, tr = usd, 0
            if row["days_since_ath"] == 0:
                btc += usd * (1 - FEE) / p
                usd = 0.0
            elif deploy > 0:
                if row["days_since_ath"] >= BUY.deadline_days_since_ath:
                    btc += usd * (1 - FEE) / p
                    usd = 0.0
                elif (last_buy is None or (t - last_buy).days >= BUY.spacing_days) and tr < BUY.tranches:
                    amt = min(deploy / BUY.tranches, usd)
                    btc += amt * (1 - FEE) / p
                    usd -= amt
                    tr, last_buy = tr + 1, t
    t = days[-1]
    p = f.loc[t, "btc"]
    eq = btc + usd / p + (alt_usd(t) / p if alts else 0) + nonlocal_usd[0] / p
    return eq, usd


cycles = [(HALVINGS[i], HALVINGS[i + 1] if i + 1 < len(HALVINGS) else None) for i in range(1, 4)]
modes = ["btc_hold", "btc_clock", "top5_static", "top5_monthly", "top5_signal", "eth"]
rows = []
for m in modes:
    chain = 1.1
    r = {"mode": m}
    for h, hn in cycles:
        eq, _ = run(h, hn, 1.1, m)
        r[str(h.date())] = eq / 1.1
        eqc, usd_left = run(h, hn, chain, m)
        chain = eqc
    r["chained_1.1_BTC_becomes"] = chain
    rows.append(r)
out = pd.DataFrame(rows).set_index("mode")
pd.set_option("display.width", 200)
print(out.round(3))
print("alt_on share of days 2016+:", round(alt_on.loc["2016-07-09":].mean(), 2))
# where the top-5 basket peaked in BTC terms vs sell window
for h, hn in cycles:
    seg = idx.loc[h:hn] if hn else idx.loc[h:]
    print(h.date(), "basket/BTC peak", seg.idxmax().date(), "day", (seg.idxmax() - h).days,
          "peak x", round(seg.max() / seg.iloc[0], 2), "at window start x",
          round(seg.iloc[min(500, len(seg) - 1)] / seg.iloc[0], 2))

print("\n--- robustness: enter N days after the halving (neg = before) ---")
res = []
for off in [-180, -90, 0, 90, 180, 270]:
    r = {"offset": off}
    for i, (h, hn) in enumerate(cycles):
        hs = h + pd.Timedelta(days=off)
        # shift the entry by running from hs but keeping the same halving clock
        global_days = f.loc[hs:hn].index[:-1] if hn else f.loc[hs:].index
        for m in ["btc_clock", "top5_static", "eth"]:
            eq, _ = run(hs, hn, 1.1, m)
            r[f"{str(h.date())[:4]}_{m}"] = round(eq / 1.1, 2)
    res.append(r)
print(pd.DataFrame(res).set_index("offset").T)

print("\n--- worst drop of the sleeve in BTC terms (top5_static, from entry to sell) ---")
for h, hn in cycles:
    seg = idx.loc[h:h + pd.Timedelta(days=580)]
    seg = seg / seg.iloc[0]
    print(h.date(), "min x", round(seg.min(), 2), "on", seg.idxmin().date())
eth = (wide["ethereum"] / f["btc"])
for h, hn in cycles:
    seg = eth.loc[h:h + pd.Timedelta(days=580)]
    seg = seg / seg.iloc[0]
    print("ETH", h.date(), "min x", round(seg.min(), 2), "max x", round(seg.max(), 2), "at day 540 x", round(seg.iloc[min(540,len(seg)-1)], 2))
print("halving-day top5:", [ (h.date(), top5[:h].iloc[-1]) for h,_ in cycles])
