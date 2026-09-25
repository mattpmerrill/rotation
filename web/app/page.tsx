import Link from "next/link";
import { createClient, currentUser } from "@/lib/supabase/server";
import { RULES, addDays, cycleMilestones, daysBetween, niceDate, pct, usd, type CycleState } from "@/lib/cycle";


const PHASE_TEXT: Record<string, string> = {
  "HOLD (before the sell window)": "Hold. The bull market is running; the sell window hasn't opened yet.",
  "SELL WINDOW": "Sell window open: sell half the BTC and all alts in four tranches.",
  "WAITING FOR THE BOTTOM": "Bear market. Holding USDT from the top? Rebuying starts when the bottom signals fire.",
  BUYING: "Rebuying BTC with the USDT from the top, in monthly tranches.",
  REDEPLOY: "Deploy all remaining USDT into BTC now.",
  "HOLD (after the sell window)": "Hold BTC and wait for the next cycle.",
};

export default async function CycleClock() {
  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.from("cycle_state").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
    currentUser(),
  ]);
  const s = data as CycleState | null;
  if (!s) return <p className="text-ink-2">The cycle clock updates daily. No data yet.</p>;

  const cycleLen = daysBetween(s.last_halving, s.next_halving_est);
  const at = (d: number) => `${Math.min(100, (d / cycleLen) * 100)}%`;
  const [w0, w1] = RULES.sell_window;
  const lastAlt = RULES.alt_slice_days[RULES.alt_slice_days.length - 1];
  const bottomFrom = daysBetween(s.last_halving, addDays(s.ath_date, RULES.buy.start_days_since_ath));

  const today = s.day;
  const timeline = [
    ...cycleMilestones(s.last_halving, false),
    ...(daysBetween(s.ath_date, today) < RULES.buy.deadline_days_since_ath
      ? [{ date: addDays(s.ath_date, RULES.buy.start_days_since_ath), label: `Bear rebuy starts at the latest (${RULES.buy.start_days_since_ath} days after the high), in ${RULES.buy.tranches} monthly tranches`, kind: "buy" as const, estimated: false }]
      : []),
    ...cycleMilestones(s.next_halving_est, true),
  ]
    .filter((m) => m.date >= addDays(today, -30))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 9);

  const dot: Record<string, string> = { alt: "bg-good", sell: "bg-btc", buy: "bg-good", halving: "bg-ink-3" };

  return (
    <>
      <section className="grid gap-3">
        <p className="label text-btc!">Cycle clock · {niceDate(s.day)}</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{s.phase.replace(/ \(.*\)/, "")}</h1>
        <p className="max-w-2xl text-ink-2">{PHASE_TEXT[s.phase] ?? ""}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["BTC", usd(s.btc_price), `${pct(s.drawdown)} below the ${usd(s.ath)} high`],
          ["Days since the high", String(s.days_since_ath), niceDate(s.ath_date)],
          ["Days since the halving", String(s.days_since_halving), niceDate(s.last_halving)],
          ["MVRV", s.mvrv == null ? "–" : s.mvrv.toFixed(2), "below 1 = a buy signal"],
        ].map(([k, v, d]) => (
          <div key={k} className="card grid gap-1 p-3">
            <span className="text-xs text-ink-2">{k}</span>
            <span className="num text-2xl">{v}</span>
            <span className="num text-xs text-ink-3">{d}</span>
          </div>
        ))}
      </section>

      <section className="card grid gap-4 p-5" aria-labelledby="bar-h">
        <h2 id="bar-h" className="text-lg font-semibold">Where we are in the four-year cycle</h2>
        <div className="relative h-12" role="img" aria-label={`Day ${s.days_since_halving} of about ${cycleLen}`}>
          <div className="absolute inset-x-0 top-4 h-4 rounded-full bg-rule" />
          <div className="absolute top-4 h-4 rounded-full bg-good/60" style={{ left: 0, width: at(lastAlt) }} title="Alt buy slices" />
          <div className="absolute top-4 h-4 bg-btc" style={{ left: at(w0), width: `calc(${at(w1)} - ${at(w0)})` }} title="Sell window" />
          {bottomFrom > w1 && bottomFrom < cycleLen && (
            <div className="absolute top-4 h-4 rounded-r-full bg-good/30" style={{ left: at(bottomFrom), right: 0 }} title="Bear rebuy" />
          )}
          <div className="absolute top-0 h-12 w-0.5 bg-ink" style={{ left: at(s.days_since_halving) }} />
          <span className="num absolute -top-1 -translate-x-1/2 text-xs font-medium" style={{ left: at(s.days_since_halving) }}>
            today
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-good/60 align-middle" />Alt buys (halving to +{lastAlt} days)</span>
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-btc align-middle" />Sell window (days {w0}-{w1})</span>
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-good/30 align-middle" />Bear rebuy</span>
          <span className="num">Next halving ~{niceDate(s.next_halving_est)} (estimated)</span>
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="tl-h">
        <h2 id="tl-h" className="text-lg font-semibold">What happens next</h2>
        <ol className="card divide-y divide-rule">
          {timeline.map((m) => (
            <li key={m.date + m.label} className={`flex items-baseline gap-4 px-4 py-3 ${m.date < today ? "opacity-50" : ""}`}>
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot[m.kind]}`} />
              <span className="num w-28 shrink-0 text-sm">{m.estimated ? "~" : ""}{niceDate(m.date)}</span>
              <span className="text-sm">{m.label}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-3">
          Dates after the next halving are estimates and firm up when it happens. Rules: sell {pct(RULES.sell_btc_frac)} of BTC and all alts in
          the window; buy alts in {RULES.alt_slice_days.length} slices from the halving to +{lastAlt} days.
        </p>
      </section>

      {!user && (
        <section className="card flex flex-wrap items-center justify-between gap-3 border-btc/40 bg-btc-soft p-5">
          <p className="max-w-xl">Sign in to set your plan, pick your five alts, and see your exact amounts for every step.</p>
          <Link href="/login" className="btn btn-primary">Sign in</Link>
        </section>
      )}
    </>
  );
}
