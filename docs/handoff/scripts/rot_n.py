src=open('../docs/handoff/scripts/rot_itc.py').read().split('print("\\nper coin')[0]
exec(src)
import itertools
both=[k for k in pool if per[(k,0)] is not None and per[(k,1)] is not None]
cand=both+["SOL"]
def sc(cs,i):
    v=[per[(k,i)] for k in cs if per[(k,i)] is not None]; return np.mean(v)*(1-FEE)**2
for excl in [[],["QNT"]]:
    c2=[k for k in cand if k not in excl]
    print("\n==== pool excl",excl or "none")
    for n in range(2,9):
        best=None;bestsafe=None
        for cs in itertools.combinations(c2,n):
            g,b=sc(cs,0),sc(cs,1); geo=np.sqrt(g*b)
            if best is None or geo>best[0]: best=(geo,cs,g,b)
            if b>=0.75 and (bestsafe is None or g>bestsafe[2]): bestsafe=(geo,cs,g,b)
        print(f"n={n} best-geo {'/'.join(best[1])} good {best[2]:.2f} bad {best[3]:.2f} geo {best[0]:.2f}")
        if bestsafe: print(f"     best-good w/bad>=.75 {'/'.join(bestsafe[1])} good {bestsafe[2]:.2f} bad {bestsafe[3]:.2f} geo {bestsafe[0]:.2f}")
