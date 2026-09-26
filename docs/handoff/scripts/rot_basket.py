from rotation.data import cache
from rotation.backtest.cycle_study import HALVINGS, load_features
from rotation.config import get_config
from rotation.rules.cycle import clock_tranche_days, rules_from_config
import pandas as pd, numpy as np, json
SELL,BUY=rules_from_config(get_config().rules.cycle); SD=clock_tranche_days(SELL)
print("sell tranche days", SD)
f=load_features()
px=cache.read("universe","prices"); rk=cache.read("universe","ranks")
wide=px.pivot_table(index="date",columns="coin_id",values="price_usd").sort_index()
btc=f["btc"]
last_seen=px.groupby("coin_id")["date"].max()
now=pd.Timestamp("2026-09-22")
dsh_now=(now-HALVINGS[-1]).days
print("days since halving now", dsh_now, "days since ATH", f.loc[now,"days_since_ath"], "ATH", f.loc[now,"ath"])
analogs=[(HALVINGS[1],HALVINGS[2]),(HALVINGS[2],HALVINGS[3])]
res={}
for h,hn in analogs:
    entry=h+pd.Timedelta(days=dsh_now)
    exits=[hn+pd.Timedelta(days=d) for d in SD]
    btc_top_day=f.loc[hn:hn+pd.Timedelta(days=700),"btc"].idxmax()
    ent=rk[rk.date==entry].sort_values("rank")
    rows=[]
    for _,r in ent.head(100).iterrows():
        c=r.coin_id
        if c not in wide: continue
        pe=wide.at[entry,c]
        if np.isnan(pe): continue
        vals=[]
        for x in exits:
            s=wide[c].loc[:x].dropna()
            if len(s)==0 or (x-s.index[-1]).days>7: vals.append(0.0)  # dead -> 0
            else: vals.append(s.iloc[-1]/pe / (btc[x]/btc[entry]))
        clock=np.mean(vals)
        seg=wide[c].loc[entry:exits[-1]].dropna()
        peak_usd=seg.max()/pe
        seg_ratio=(seg/btc.reindex(seg.index))/(pe/btc[entry])
        rows.append(dict(coin=c,rank=int(r['rank']),vsBTC_clock=clock,usd_clock=clock*np.mean([btc[x] for x in exits])/btc[entry],
                         peak_usd_x=peak_usd,peak_date=str(seg.idxmax().date()),worst_vsBTC=seg_ratio.min()))
    d=pd.DataFrame(rows)
    key=f"{entry.date()}"
    res[key]=d
    bx=np.mean([btc[x] for x in exits])/btc[entry]
    print(f"\n=== analog entry {entry.date()} (day {dsh_now}) -> clock exits {[str(x.date()) for x in exits]}  BTC USD x at clock exit={bx:.2f}  BTC top {btc_top_day.date()} x={btc[btc_top_day]/btc[entry]:.2f}")
    print(" coins beating BTC:", (d.vsBTC_clock>1).mean().round(2), " median vsBTC", d.vsBTC_clock.median().round(2))
    for n in [5,6,10,20,50,100]:
        s=d.nsmallest(n,"rank")
        print(f" top{n} equal-weight vsBTC {s.vsBTC_clock.mean():.2f}  (median coin {s.vsBTC_clock.median():.2f}, beat BTC {(s.vsBTC_clock>1).sum()}/{len(s)})")
    print(d.sort_values("rank").head(30).round(2).to_string(index=False))
    print(" best 15:"); print(d.nlargest(15,"vsBTC_clock").round(2).to_string(index=False))
pd.to_pickle(res,"../docs/handoff/scripts/rot_res.pkl")
