import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { COINS, btc, coinById, niceDate, usd, type CycleState } from "@/lib/cycle";
import { deleteTrade, logTrade } from "./actions";

type Trade = { id: number; traded_on: string; asset: string; side: string; qty: number; price_usd: number | null; fee_usd: number; plan_step: string | null; note: string | null };

export default async function StackPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: hold }, { data: trades }, { data: stateRow }] = await Promise.all([
    supabase.from("holdings").select("asset, qty"),
    supabase.from("trades").select("*").order("traded_on", { ascending: false }).order("id", { ascending: false }).limit(200),
    supabase.from("cycle_state").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const s = stateRow as CycleState | null;
  const btcPx = s?.btc_price ?? 0;
  const alts = (hold ?? []).filter((r) => r.asset !== "bitcoin" && r.asset !== "usdt").map((r) => r.asset as string);
  const { data: px } = alts.length
    ? await supabase.from("daily_prices").select("coin_id, date, close").in("coin_id", alts).order("date", { ascending: false }).limit(alts.length * 5)
    : { data: [] as { coin_id: string; date: string; close: number }[] };
  const latest = new Map<string, { close: number; date: string }>();
  for (const p of px ?? []) if (!latest.has(p.coin_id)) latest.set(p.coin_id, { close: p.close, date: p.date });

  const label = (id: string) => (id === "bitcoin" ? "BTC" : id === "usdt" ? "USDT" : coinById.get(id)?.symbol ?? id);
  const rows = (hold ?? []).map((r) => {
    const qty = Number(r.qty);
    const price = r.asset === "bitcoin" ? btcPx : r.asset === "usdt" ? 1 : latest.get(r.asset)?.close;
    const value = price != null ? qty * price : null;
    return { asset: r.asset as string, qty, value, inBtc: value != null && btcPx ? value / btcPx : null };
  });
  const total = rows.reduce((a, r) => a + (r.inBtc ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <section className="grid gap-2">
        <p className="label">My stack</p>
        <h1 className="text-3xl font-bold">{rows.length ? btc(total) : "Log your holdings to start"}</h1>
        <p className="text-ink-2">{rows.length ? `Everything you hold, valued in BTC at ${usd(btcPx)}.` : "Add your BTC as an opening balance below: side Deposit, asset BTC."}</p>
      </section>

      {rows.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">
              {["Asset", "Quantity", "Value", "In BTC"].map((x) => <th key={x} className="label px-4 py-2 font-medium">{x}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.asset} className="border-t border-rule">
                  <td className="px-4 py-2">{label(r.asset)}</td>
                  <td className="num px-4 py-2">{r.qty.toFixed(r.asset === "usdt" ? 2 : 6)}</td>
                  <td className="num px-4 py-2">{r.value != null ? usd(r.value) : "no price yet"}</td>
                  <td className="num px-4 py-2">{r.inBtc != null ? r.inBtc.toFixed(4) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card grid gap-4 p-5" aria-labelledby="log-h">
        <h2 id="log-h" className="text-lg font-semibold">Log a trade</h2>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {saved && <p role="status" className="text-sm text-good">Saved.</p>}
        <form action={logTrade} className="grid gap-3 sm:grid-cols-4">
          <datalist id="assets">
            <option value="bitcoin" label="BTC · Bitcoin" />
            <option value="usdt" label="USDT · Tether" />
            {COINS.map((c) => <option key={c.id} value={c.id} label={`${c.symbol} · ${c.name}`} />)}
          </datalist>
          <label className="grid gap-1 text-sm">Date<input id="traded_on" name="traded_on" type="date" defaultValue={today} required className="field" /></label>
          <label className="grid gap-1 text-sm">Side
            <select id="side" name="side" className="field" defaultValue="buy">
              <option value="buy">Buy</option><option value="sell">Sell</option>
              <option value="deposit">Deposit (opening balance)</option><option value="withdraw">Withdraw</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">Asset<input id="asset" name="asset" list="assets" required placeholder="bitcoin" className="field" autoComplete="off" /></label>
          <label className="grid gap-1 text-sm">Quantity<input id="qty" name="qty" type="number" step="any" min="0" required className="field num" /></label>
          <label className="grid gap-1 text-sm">Price, USD per coin<input id="price_usd" name="price_usd" type="number" step="any" min="0" placeholder="buys and sells" className="field num" /></label>
          <label className="grid gap-1 text-sm">Fee, USD<input id="fee_usd" name="fee_usd" type="number" step="any" min="0" defaultValue="0" className="field num" /></label>
          <label className="grid gap-1 text-sm">Plan step (optional)<input id="plan_step" name="plan_step" placeholder="e.g. alt_slice_1" className="field" /></label>
          <label className="grid gap-1 text-sm">Note<input id="note" name="note" maxLength={200} className="field" /></label>
          <div className="sm:col-span-4"><button className="btn btn-primary">Save trade</button></div>
        </form>
        <p className="text-xs text-ink-3">Buys and sells are against USDT. The plan step comes from My plan (for example alt_slice_2) and marks that step done.</p>
      </section>

      <section className="grid gap-3" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-semibold">Trade log</h2>
        {(trades ?? []).length === 0 ? <p className="text-ink-2">No trades yet.</p> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left">
                {["Date", "Side", "Asset", "Qty", "Price", "Fee", "Step", ""].map((x) => <th key={x} className="label px-3 py-2 font-medium">{x}</th>)}
              </tr></thead>
              <tbody>
                {(trades as Trade[]).map((t) => (
                  <tr key={t.id} className="border-t border-rule">
                    <td className="num px-3 py-2">{niceDate(t.traded_on)}</td>
                    <td className="px-3 py-2">{t.side}</td>
                    <td className="px-3 py-2">{label(t.asset)}</td>
                    <td className="num px-3 py-2">{Number(t.qty).toFixed(6)}</td>
                    <td className="num px-3 py-2">{t.price_usd ? usd(t.price_usd) : "–"}</td>
                    <td className="num px-3 py-2">{t.fee_usd ? usd(t.fee_usd) : "–"}</td>
                    <td className="num px-3 py-2 text-ink-3">{t.plan_step ?? ""}</td>
                    <td className="px-3 py-2">
                      <form action={deleteTrade}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-bad underline" aria-label={`Delete the ${t.side} of ${label(t.asset)} on ${t.traded_on}`}>Delete</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
