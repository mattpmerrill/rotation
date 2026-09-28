import type { MarketState } from "@/domain/types";
import { formatDay, formatUsd } from "@/lib/format";

/** Where BTC stands today, and whether the bear rebuy window is open. */
export function MarketStrip({ market }: { market: MarketState }) {
  const facts = [
    { label: "Bitcoin", value: formatUsd(market.btcPrice), tone: "text-gold" },
    { label: "Below its high", value: `${Math.round(market.drawdown * 100)}%`, tone: "text-ink" },
    { label: "MVRV", value: market.mvrv == null ? "n/a" : market.mvrv.toFixed(2), tone: "text-ink" },
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {facts.map((f) => (
        <div key={f.label} className="panel grid gap-0.5 px-4 py-2.5">
          <span className="text-ink-3 text-xs">{f.label}</span>
          <span className={`font-semibold ${f.tone}`}>{f.value}</span>
        </div>
      ))}
      <div className={`panel grid gap-0.5 px-4 py-2.5 ${market.rebuyWindowOpen ? "border-gain/50 bg-gain/10" : ""}`}>
        <span className="text-ink-3 text-xs">Bear rebuy window</span>
        <span className={`font-semibold ${market.rebuyWindowOpen ? "text-gain" : "text-ink-2"}`}>
          {market.rebuyWindowOpen ? "Open" : "Closed"}
        </span>
      </div>
      <span className="text-ink-3 self-end pb-1 text-xs">as of {formatDay(market.day)}</span>
    </div>
  );
}
