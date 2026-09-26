"use client";

import { useEffect, useMemo, useState } from "react";
import { previewBasket, type BasketHistory } from "@/domain/preview";
import { RULES } from "@/domain/rules";
import type { Coin } from "@/domain/types";
import { CycleCard } from "@/ui/CycleCard";
import { Notice } from "@/ui/Notice";

let historyRequest: Promise<BasketHistory> | null = null;
const loadHistory = () => (historyRequest ??= fetch("/data/basket-history.json").then((r) => r.json()));

/** How the pick would have done if bought at this same point in the last two cycles. */
export function PreviewPanel({
  basket,
  coins,
  daysSinceHalving,
  sellWindowDays,
}: {
  basket: string[];
  coins: Record<string, Coin>;
  daysSinceHalving: number;
  sellWindowDays: [number, number];
}) {
  const [history, setHistory] = useState<BasketHistory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadHistory().then(setHistory, () => setFailed(true));
  }, []);

  const cycles = useMemo(
    () => (history ? previewBasket(history, basket, daysSinceHalving, sellWindowDays, RULES.defaultFeeRate) : []),
    [history, basket, daysSinceHalving, sellWindowDays],
  );

  if (failed) return <Notice tone="error">The history didn’t load. Reload the page to try again.</Notice>;
  if (!history) return <p className="text-ink-3 text-sm">Loading past cycles…</p>;

  return (
    <div className="grid gap-6">
      <p className="text-ink-2 text-sm">
        1 BTC split equally across your coins on day {daysSinceHalving} after the halving, the same point in the cycle
        as today. The line is its value in BTC; the dashed line is 1 BTC; the shaded band is the old sell window. A coin
        that wasn’t trading yet keeps its share in BTC until it starts, then buys in. Weekly prices, 1% fee each way.
      </p>
      <div className="grid gap-8 lg:grid-cols-2">
        {cycles.map((c) => (
          <CycleCard key={c.label} cycle={c} coins={coins} />
        ))}
      </div>
      <Notice>
        Read this with care. These coins are today’s top 100, so they all survived: real picks back then would have done
        worse. Coins bought when they first started trading often show huge gains from tiny starting prices.
      </Notice>
    </div>
  );
}
