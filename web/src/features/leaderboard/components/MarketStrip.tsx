import type { MarketState } from "@/data/market";
import { formatDay, formatUsd } from "@/lib/format";

/** Where BTC stands today, and whether the bear rebuy window is open. */
export function MarketStrip({ market }: { market: MarketState }) {
  const facts = [
    { label: "BTC", value: formatUsd(market.btcPrice) },
    { label: "From its high", value: `−${Math.round(market.drawdown * 100)}%` },
    { label: "MVRV", value: market.mvrv == null ? "n/a" : market.mvrv.toFixed(2) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {facts.map((f) => (
        <span key={f.label} className="text-ink-3">
          {f.label} <span className="text-ink font-semibold">{f.value}</span>
        </span>
      ))}
      <span className={market.rebuyWindowOpen ? "text-gain font-semibold" : "text-ink-3"}>
        {market.rebuyWindowOpen ? "Bear rebuy window is open" : "Bear rebuy window closed"}
      </span>
      <span className="text-ink-3 text-xs">as of {formatDay(market.day)}</span>
    </div>
  );
}
