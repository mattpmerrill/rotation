import type { MarketState } from "@/domain/types";
import type { CycleReference } from "@/domain/cycle";
import { formatDay, formatMonth } from "@/lib/format";

/** The halving clock and the rebuy rule, as context for deciding when to sell and rebuy.
 *  Not instructions: the challenge has no schedule. */
export function ReferenceDates({
  cycle,
  market,
  rebuyRule,
}: {
  cycle: CycleReference;
  market: MarketState | null;
  rebuyRule: { daysSinceHigh: number; drawdown: number; mvrvBelow: number };
}) {
  const rows = [
    { term: "Since the last halving", detail: `${cycle.daysSinceHalving} days (${formatDay(cycle.lastHalving)})` },
    { term: "Next halving", detail: `around ${formatMonth(cycle.nextHalvingEst)} (estimated)` },
    {
      term: "Old sell window",
      detail: `${formatMonth(cycle.sellWindow[0])} to ${formatMonth(cycle.sellWindow[1])}. BTC topped in this window after the last three halvings. No alert we tested sold alts better.`,
    },
    {
      term: "Bear rebuy window",
      detail: `${market?.rebuyWindowOpen ? "Open now." : "Closed."} Opens ${rebuyRule.daysSinceHigh} days after BTC's high, at ${Math.round(rebuyRule.drawdown * 100)}% below it, or when MVRV falls under ${rebuyRule.mvrvBelow}. You'll get a Discord alert.`,
    },
  ];
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-[12rem_1fr] sm:gap-x-6">
      {rows.map((r) => (
        <div key={r.term} className="contents">
          <dt className="text-ink font-semibold">{r.term}</dt>
          <dd className="text-ink-2">{r.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
