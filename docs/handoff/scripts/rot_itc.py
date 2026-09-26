from rotation.data import cache
from rotation.backtest.cycle_study import HALVINGS, load_features
from rotation.config import get_config
from rotation.rules.cycle import clock_tranche_days, rules_from_config
import pandas as pd, numpy as np, itertools
SELL,_=rules_from_config(get_config().rules.cycle); SD=clock_tranche_days(SELL)
f=load_features(); btc=f.btc
px=cache.read("universe","prices"); rk=cache.read("universe","ranks")
wide=px.pivot_table(index="date",columns="coin_id",values="price_usd").sort_index()
FEE=0.01; dsh=(pd.Timestamp("2026-09-22")-HALVINGS[-1]).days
itc={"ETH":"ethereum","XRP":"ripple","BNB":"binancecoin","SOL":"solana","DOGE":"dogecoin","BCH":"bitcoin-cash","ADA":"cardano","HYPE":"hyperliquid","LINK":"chainlink","CC":"canton-network","XLM":"stellar","HBAR":"hedera-hashgraph","ZEC":"zcash","LTC":"litecoin","AVAX":"avalanche-2","SHIB":"shiba-inu","SUI":"sui","TON":"the-open-network","CRO":"crypto-com-chain","WLFI":"world-liberty-financial","DOT":"polkadot","UNI":"uniswap","MNT":"mantle","TAO":"bittensor","AAVE":"aave","ASTER":"aster-2","PEPE":"pepe","SKY":"sky","NEAR":"near","ONDO":"ondo-finance","ICP":"internet-computer","ATOM":"cosmos","POL":"polygon-ecosystem-token","TRUMP":"official-trump","FLR":"flare-networks","QNT":"quant-network","ALGO":"algorand","RENDER":"render-token","FIL":"filecoin","XDC":"xdce-crowd-sale","APT":"aptos","VET":"vechain","ARB":"arbitrum","STX":"blockstack","PENGU":"pudgy-penguins","DASH":"dash","XTZ":"tezos","FET":"fetch-ai","INJ":"injective-protocol","CRV":"curve-dao-token","TIA":"celestia","LDO":"lido-dao","AERO":"aerodrome-finance","ZRO":"layerzero","SEI":"sei-network","PENDLE":"pendle"}
top100=set(rk[rk.date==rk.date.max()].nsmallest(100,"rank").coin_id)
pool={k:v for k,v in itc.items() if v in top100}
print("ITC & top100:",len(pool),sorted(pool))
cyc=[(HALVINGS[1],HALVINGS[2]),(HALVINGS[2],HALVINGS[3])]
per={}
for i,(h,hn) in enumerate(cyc):
    e=h+pd.Timedelta(days=dsh); ex=[hn+pd.Timedelta(days=d) for d in SD]; bx=np.mean([btc[x] for x in ex])
    for k,c in pool.items():
        if c not in wide or np.isnan(wide.at[e,c]): per[(k,i)]=None; continue
        vals=[]
        for x in ex:
            s=wide[c].loc[:x].dropna()
            vals.append(0 if (x-s.index[-1]).days>7 else s.iloc[-1])
        per[(k,i)]=np.mean(vals)/wide.at[e,c]*btc[e]/bx
print("\nper coin (good 2018->21 | bad 2022->25):")
for k in pool:
    g,b=per[(k,0)],per[(k,1)]
    if b is not None or g is not None: print(f" {k:6} {'-' if g is None else round(g,2):>6} | {'-' if b is None else round(b,2)}")
both=[k for k in pool if per[(k,0)] is not None and per[(k,1)] is not None]
badonly=[k for k in pool if per[(k,0)] is None and per[(k,1)] is not None]
print("\nboth cycles:",both,"\nbad-only:",badonly)
def sc(cs,i):
    v=[per[(k,i)] for k in cs if per[(k,i)] is not None]; return np.mean(v)*(1-FEE)**2 if v else np.nan
rows=[]
cand=both+["SOL"]
for n in (5,6):
    for cs in itertools.combinations(cand,n):
        g,b=sc(cs,0),sc(cs,1); rows.append(("/".join(cs),n,round(g,2),round(b,2),round(np.sqrt(g*b),2)))
d=pd.DataFrame(rows,columns=["basket","n","good","bad","geo"])
pd.set_option("display.width",200)
print("\nbest bad-cycle:");print(d.nlargest(12,"bad").to_string(index=False))
print("\nbest geo-mean:");print(d.nlargest(12,"geo").to_string(index=False))
print("\nbest good w/ bad>=0.75:");print(d[d.bad>=0.75].nlargest(10,"good").to_string(index=False))
