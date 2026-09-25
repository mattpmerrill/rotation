import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { RULES, addDays, btc, cycleMilestones, niceDate, usd, type CycleState } from "@/lib/cycle";
import { liveRanks } from "@/lib/ranks";
import { savePlan } from "./actions";

type Plan = { alt_budget_btc: number; sell_btc_frac: number; basket: string[] };
type Action = { kind: string; asset: string; qty: number | null; usd: number | null; plan_step: string; reason: string };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: planRow }, { data: hold }, { data: stateRow }] = await Promise.all([
    supabase.from("plans").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("asset, qty"),
    supabase.from("cycle_state").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const s = stateRow as CycleState | null;
  const ranks = await liveRanks(supabase);
  const coinById = new Map(ranks.coins.map((c) => [c.id, c]));
  const { data: acts } = s
    ? await supabase.from("actions").select("*").eq("day", s.day)
    : { data: [] as Action[] };

  const plan: Plan = planRow ?? { alt_budget_btc: 1, sell_btc_frac: RULES.sell_btc_frac, basket: [] };
  const h = new Map((hold ?? []).map((r) => [r.asset as string, Number(r.qty)]));
  const btcNow = h.get("bitcoin") ?? 0;
  const usdtNow = h.get("usdt") ?? 0;
  const altsNow = [...h.entries()].filter(([a]) => a !== "bitcoin" && a !== "usdt");
  const coinsIn = plan.basket.length || 5;
  const label = (id: string) => (id === "bitcoin" ? "BTC" : coinById.get(id)?.symbol ?? id);

  // The schedule with this person's amounts (the daily job computes the same steps each day).
  const nextCycle = s ? cycleMilestones(s.next_halving_est, true) : [];
  const slice = plan.alt_budget_btc / RULES.alt_slice_days.length;
  const coreAtTop = Math.max(btcNow - plan.alt_budget_btc, 0);
  const perSell = (coreAtTop * plan.sell_btc_frac) / RULES.sell_tranches;
  const rows = nextCycle
    .filter((m) => m.kind !== "halving")
    .map((m) => ({
      ...m,
      amount:
        m.kind === "alt"
          ? `Sell ${btc(slice)}; buy ${btc(slice / coinsIn, 5)} worth of each of your ${coinsIn} alts`
          : `Sell ${btc(perSell)} and 1/${RULES.sell_tranches} of each alt (the last tranche sells all remaining alts)`,
    }));

  return (
    <>
      <section className="grid gap-2">
        <p className="label">My plan</p>
        <h1 className="text-3xl font-bold">Your schedule, with your amounts</h1>
        <p className="max-w-2xl text-ink-2">
          Amounts use your holdings from <Link href="/stack" className="underline">My stack</Link>. Log each trade there when you make it, and the
          plan marks that step done.
        </p>
      </section>

      {s && (
        <section className="card grid gap-3 p-5" aria-labelledby="today-h">
          <h2 id="today-h" className="text-lg font-semibold">Today, {niceDate(s.day)}</h2>
          {(acts ?? []).length === 0 ? (
            <p className="text-ink-2">No action today. Phase: {s.phase.toLowerCase()}.</p>
          ) : (
            <ul className="grid gap-2">
              {(acts as Action[]).map((a) => (
                <li key={a.plan_step + a.asset + a.kind} className="flex flex-wrap items-baseline gap-x-3">
                  <span className={`num rounded px-1.5 py-0.5 text-xs font-medium ${a.kind === "sell" ? "bg-btc-soft text-btc" : "bg-good/15 text-good"}`}>
                    {a.kind.toUpperCase()}
                  </span>
                  <span className="num">
                    {a.qty != null ? `${a.qty.toFixed(a.asset === "bitcoin" ? 4 : 2)} ${label(a.asset)}` : label(a.asset)}
                    {a.usd != null ? ` (~${usd(a.usd)})` : ""}
                  </span>
                  <span className="text-sm text-ink-2">{a.reason}</span>
                  <span className="num text-xs text-ink-3">step {a.plan_step}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card grid gap-4 p-5" aria-labelledby="set-h">
        <h2 id="set-h" className="text-lg font-semibold">Settings</h2>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {saved && <p role="status" className="text-sm text-good">Saved.</p>}
        <form action={savePlan} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Alt budget (BTC moved into your basket at the next halving)
              <input id="alt_budget_btc" name="alt_budget_btc" type="number" step="0.0001" min="0" defaultValue={plan.alt_budget_btc} className="field num" />
            </label>
            <label className="grid gap-1 text-sm">BTC to sell in the sell window
              <select id="sell_btc_frac" name="sell_btc_frac" defaultValue={String(plan.sell_btc_frac)} className="field">
                <option value="0.3333">A third</option>
                <option value="0.5">Half</option>
              </select>
            </label>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm">Your five alts <span className="text-ink-3">(test combinations in the <a href="/explorer.html#lab" className="underline">Basket Lab</a>)</span></legend>
            <datalist id="coins">
              {ranks.coins.map((c) => <option key={c.id} value={c.id} label={`#${c.rank} ${c.symbol} · ${c.name}`} />)}
            </datalist>
            <div className="grid gap-2 sm:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => {
                const id = plan.basket[i] ?? "";
                const c = coinById.get(id);
                return (
                  <label key={i} className="grid gap-1 text-xs text-ink-3">Alt {i + 1}
                    <input id={`coin${i}`} name={`coin${i}`} list="coins" defaultValue={id} placeholder="e.g. ethereum" className="field text-sm text-ink" autoComplete="off" />
                    <span className={(c && c.rank > RULES.alt_max_rank) || (id && !c) ? "text-bad" : ""}>
                      {c
                        ? `${c.symbol} · #${c.rank}${c.rank > RULES.alt_max_rank ? " (outside the top 100)" : ""}`
                        : id
                          ? "not in today's top 200"
                          : "\u00a0"}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-ink-3">
              Ranks {ranks.live ? "updated daily" : "from a snapshot"}, as of {niceDate(ranks.asOf)} (stablecoins and wrapped coins don&apos;t count).
              A coin must be in the top {RULES.alt_max_rank} on the day you buy it.
            </p>
          </fieldset>
          <div><button className="btn btn-primary">Save plan</button></div>
        </form>
      </section>

      {s && (
        <section className="grid gap-3" aria-labelledby="sched-h">
          <h2 id="sched-h" className="text-lg font-semibold">Next cycle (from the ~{niceDate(s.next_halving_est)} halving)</h2>
          <ol className="card divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.date + r.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
                <span className="num text-sm">~{niceDate(r.date)}</span>
                <span className="text-sm"><b className="font-semibold">{r.label.split(":")[0]}.</b> {r.amount}</span>
              </li>
            ))}
            <li className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
              <span className="num text-sm">after the top</span>
              <span className="text-sm"><b className="font-semibold">Bear rebuy.</b> All USDT back into BTC in {RULES.buy.tranches} monthly tranches once the bottom signals fire.</span>
            </li>
          </ol>
          {usdtNow > 1 && (
            <p className="card p-4 text-sm">
              You hold {usd(usdtNow)} USDT now: this cycle&apos;s rebuy starts by ~{niceDate(addDays(s.ath_date, RULES.buy.start_days_since_ath))},
              {" "}{usd(usdtNow / RULES.buy.tranches)} per tranche.
            </p>
          )}
          {altsNow.length > 0 && (
            <p className="text-xs text-ink-3">You hold {altsNow.map(([a, q]) => `${q.toFixed(2)} ${label(a)}`).join(", ")}.</p>
          )}
          <p className="text-xs text-ink-3">
            Assumes your alt budget comes out of your BTC, so {btc(coreAtTop)} stays in the core. Fee per trade: {Math.round(RULES.fee_per_trade * 100)}%.
          </p>
        </section>
      )}
    </>
  );
}
