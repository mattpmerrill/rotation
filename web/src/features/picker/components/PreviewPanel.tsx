"use client";

import { useEffect, useMemo, useState } from "react";
import { previewBasket, type BasketHistory } from "@/domain/preview";
import { RULES } from "@/domain/rules";
import { formatBtc, formatMonth } from "@/lib/format";
import { Notice } from "@/ui/Notice";
import { PreviewChart } from "./PreviewChart";

let historyRequest: Promise<BasketHistory> | null = null;
const loadHistory = () => (historyRequest ??= fetch("/data/basket-history.json").then((r) => r.json()));

/** How the pick would have done if bought at this same point in the last two cycles. */
export function PreviewPanel({
  basket,
  daysSinceHalving,
  sellWindowDays,
}: {
  basket: string[];
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
        1 BTC into your basket on day {daysSinceHalving} after the halving, the same point in the cycle as today. The
        line is its value in BTC; the dashed line is 1 BTC, and the shaded band is the old sell window. Weekly prices,
        1% fee each way.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {cycles.map((c) => (
          <figure key={c.label} className="grid gap-3">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{c.label}</span>
              <span className="text-ink-3 text-xs">bought {formatMonth(c.entryWeek)}</span>
            </figcaption>
            {c.used.length ? (
              <>
                <PreviewChart cycle={c} />
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Stat
                    term="In the sell window"
                    value={c.atSellWindow == null ? "n/a" : formatBtc(c.atSellWindow, 2)}
                    good={(c.atSellWindow ?? 0) >= 1}
                  />
                  <Stat term="Lowest" value={formatBtc(c.low, 2)} good={c.low >= 1} />
                  <Stat term="Best week" value={formatBtc(c.peak.btc, 2)} good={c.peak.btc >= 1} />
                </dl>
                {c.missing.length > 0 && (
                  <p className="text-ink-3 text-xs">
                    Left out, didn’t exist yet: {c.missing.map((id) => history.coins[id]?.symbol ?? id).join(", ")}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-ink-3 text-sm">None of these coins existed then.</p>
            )}
          </figure>
        ))}
      </div>
      <Notice>
        Read this with care. These coins are today’s top 100, so they all survived: real picks back then would have done
        worse. In the 2022 cycle every basket we tested ended with less BTC, and even the best week was worth at most
        about 1.25 BTC.
      </Notice>
    </div>
  );
}

function Stat({ term, value, good }: { term: string; value: string; good: boolean }) {
  return (
    <div className="border-line rounded-xl border px-3 py-2">
      <dt className="text-ink-3 text-xs">{term}</dt>
      <dd className={`font-semibold ${good ? "text-gain" : "text-loss"}`}>{value}</dd>
    </div>
  );
}
