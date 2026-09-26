import type { CyclePreview } from "@/domain/preview";
import type { Coin } from "@/domain/types";
import { formatBtc, formatMonth } from "@/lib/format";
import { BasketHistoryChart } from "./charts/BasketHistoryChart";
import { CoinIcon } from "./CoinIcon";

/** One past cycle for a basket: the chart, three numbers, and how each coin did. */
export function CycleCard({
  cycle,
  coins,
  color,
}: {
  cycle: CyclePreview;
  coins: Record<string, Coin>;
  color?: string;
}) {
  const meta = (id: string) => coins[id] ?? { id, symbol: id.toUpperCase(), name: id, image: null };
  return (
    <figure className="grid content-start gap-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg font-semibold">{cycle.label}</span>
        <span className="text-ink-3 text-xs">bought {formatMonth(cycle.entryWeek)}</span>
      </figcaption>
      <BasketHistoryChart cycle={cycle} color={color} />
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Stat term="In the sell window" value={cycle.atSellWindow} />
        <Stat term="Lowest" value={cycle.low} />
        <Stat term="Best week" value={cycle.peak.btc} />
      </dl>
      <ul className="grid gap-1.5 text-sm" aria-label="Each coin in the sell window">
        {cycle.coins.map((c) => {
          const m = meta(c.id);
          return (
            <li key={c.id} className="flex items-center gap-2.5">
              <CoinIcon symbol={m.symbol} image={m.image} size={20} />
              <span className="font-semibold">{m.symbol}</span>
              <span className="text-ink-3 text-xs">
                {c.neverListed
                  ? "not trading yet: held as BTC"
                  : c.boughtLate
                    ? `bought when it started trading, ${formatMonth(c.boughtLate)}`
                    : null}
              </span>
              <span
                className={`ml-auto font-semibold ${c.atSellWindow == null ? "text-ink-3" : c.atSellWindow >= 1 ? "text-gain" : "text-loss"}`}
              >
                {c.atSellWindow == null ? "n/a" : `${c.atSellWindow.toFixed(2)}×`}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Stat({ term, value }: { term: string; value: number | null }) {
  const tone = value == null ? "text-ink-3" : value >= 1 ? "text-gain" : "text-loss";
  return (
    <div className="border-line bg-bg/40 rounded-xl border px-3 py-2">
      <dt className="text-ink-3 text-xs">{term}</dt>
      <dd className={`font-semibold ${tone}`}>{value == null ? "n/a" : formatBtc(value, 2)}</dd>
    </div>
  );
}
