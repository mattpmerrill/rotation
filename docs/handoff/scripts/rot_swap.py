from rotation.data import cache
from rotation.backtest.cycle_study import HALVINGS, load_features
from rotation.config import get_config
from rotation.rules.cycle import clock_tranche_days, rules_from_config
import pandas as pd, numpy as np
SELL,_=rules_from_config(get_config().rules.cycle); SD=clock_tranche_days(SELL)
f=load_features(); btc=f.btc
px=cache.read("universe","prices")
wide=px.pivot_table(index="date",columns="coin_id",values="price_usd").sort_index()
FEE=0.01; dsh=(pd.Timestamp("2026-09-22")-HALVINGS[-1]).days
def ev(cs):
    out=[]
    for h,hn in [(HALVINGS[1],HALVINGS[2]),(HALVINGS[2],HALVINGS[3])]:
        e=h+pd.Timedelta(days=dsh); ex=[hn+pd.Timedelta(days=d) for d in SD]
        have=[c for c in cs if c in wide and not np.isnan(wide.at[e,c])]
        q={c:(1-FEE)*btc[e]/len(have)/wide.at[e,c] for c in have}
        path=sum(q[c]*wide[c].loc[e:ex[-1]].ffill() for c in have)
        clock=np.mean([path.asof(x) for x in ex])*(1-FEE)/np.mean([btc[x] for x in ex])
        r=path/btc.reindex(path.index)
        out.append(f"{clock:.2f} BTC (low {r.min():.2f}, {len(have)}/{len(cs)} existed)")
    return " | ".join(out)
B=["ethereum","binancecoin","ripple","solana","tron","dogecoin"]
C=["ethereum","binancecoin","solana","hyperliquid","okb","chainlink"]
cands=["tron","okb","chainlink","cardano","bitcoin-cash","hyperliquid","litecoin","avalanche-2","stellar","monero","zcash"]
print("B as-is:",ev(B))
for c in cands:
    if c=="tron": continue
    print("B with",c,"for TRX:",ev([x if x!="tron" else c for x in B]))
print("C as-is:",ev(C))
for c in cands:
    if c in C: continue
    print("C with",c,"for OKB:",ev([x if x!="okb" else c for x in C]))
