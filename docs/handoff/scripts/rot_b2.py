from rotation.data import cache
from rotation.backtest.cycle_study import HALVINGS, load_features
from rotation.config import get_config
from rotation.rules.cycle import clock_tranche_days, rules_from_config
import pandas as pd, numpy as np
SELL,_=rules_from_config(get_config().rules.cycle); SD=clock_tranche_days(SELL)
f=load_features(); btc=f.btc
px=cache.read("universe","prices")
wide=px.pivot_table(index="date",columns="coin_id",values="price_usd").sort_index()
FEE=0.01
baskets={
 "A Matt ETH/SOL/BNB/SUI/XRP/DOGE":["ethereum","solana","binancecoin","sui","ripple","dogecoin"],
 "B Top-6 cap ETH/BNB/XRP/SOL/TRX/DOGE":["ethereum","binancecoin","ripple","solana","tron","dogecoin"],
 "C Exchange-heavy ETH/BNB/SOL/HYPE/OKB/LINK":["ethereum","binancecoin","solana","hyperliquid","okb","chainlink"],
 "D High-beta SOL/SUI/HYPE/DOGE/LINK/AVAX":["solana","sui","hyperliquid","dogecoin","chainlink","avalanche-2"],
 "E Old-guard ETH/BNB/XRP/DOGE/LINK/ADA":["ethereum","binancecoin","ripple","dogecoin","chainlink","cardano"],
}
now=pd.Timestamp("2026-09-22"); dsh=(now-HALVINGS[-1]).days
for name,cs in baskets.items():
    print("\n##",name)
    for h,hn in [(HALVINGS[1],HALVINGS[2]),(HALVINGS[2],HALVINGS[3])]:
        e=h+pd.Timedelta(days=dsh); ex=[hn+pd.Timedelta(days=d) for d in SD]
        have=[c for c in cs if c in wide and not np.isnan(wide.at[e,c])]
        if not have: print(" ",e.date(),"none existed"); continue
        # equal weight, buy with 1 BTC, fee
        q={c:(1-FEE)*btc[e]/len(have)/wide.at[e,c] for c in have}
        path=sum(q[c]*wide[c].loc[e:ex[-1]].ffill() for c in have)
        clock=np.mean([path.asof(x) for x in ex])*(1-FEE)/np.mean([btc[x] for x in ex])
        ratio=path/btc.reindex(path.index)
        pk=path.idxmax()
        print(f"  analog {e.date()} [{len(have)}/{len(cs)} existed: {','.join(have)}]  clock-exit = {clock:.2f} BTC | sold at basket USD peak {pk.date()} = {path.max()*(1-FEE)/btc[pk]:.2f} BTC, USD x {path.max()/btc[e]:.1f} | best BTC-ratio {ratio.max():.2f} on {ratio.idxmax().date()} | worst {ratio.min():.2f}")
# current prices for today pricing table
print(wide.loc[now, sum(baskets.values(),[])].drop_duplicates())
# where coins stand vs their ATH in BTC terms now
for c in sorted(set(sum(baskets.values(),[]))):
    s=(wide[c]/btc.reindex(wide.index)).dropna()
    print(c, "now/ATH-in-BTC", round(s.iloc[-1]/s.max(),2), "now USD/ATH", round(wide[c].dropna().iloc[-1]/wide[c].max(),2))
