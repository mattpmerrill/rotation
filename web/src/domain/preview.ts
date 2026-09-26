import { addDays, daysBetween } from "@/lib/days";

/** The picker's history file (engine: `rotation web-data`, web/public/data/basket-history.json). */
export interface BasketHistory {
  generated: string;
  ranks_as_of: string;
  coins: Record<string, { symbol: string; name: string }>;
  cycles: HistoryCycle[];
}

export interface HistoryCycle {
  halving: string;
  next_halving: string;
  weeks: string[];
  btc_usd: (number | null)[];
  /** Weekly price in BTC, scaled so the coin's first week is 1000; null before it existed. */
  coins: Record<string, (number | null)[]>;
}

export interface CyclePreview {
  /** e.g. "2018 → 2021" */
  label: string;
  entryWeek: string;
  /** Coins with a price at the entry week (the rest didn't exist yet). */
  used: string[];
  missing: string[];
  /** BTC value of 1 BTC put into the basket, week by week, after the buy-in fee. */
  points: { week: string; btc: number }[];
  low: number;
  peak: { week: string; btc: number };
  /** BTC after selling in the old sell window (both fees paid): a reference, not a rule. */
  atSellWindow: number | null;
  sellWindow: [string, string];
  /** The first and last weeks of the chart inside the sell window, for shading it. */
  sellWindowWeeks: [string, string] | null;
}

/**
 * How an equal-weight basket would have done if bought at the same point in a past cycle
 * (same days since that cycle's halving). Hindsight warning: the picker offers today's
 * coins, which survived by definition.
 */
export function previewBasket(
  history: BasketHistory,
  basket: string[],
  daysSinceHalving: number,
  sellWindowDays: [number, number],
  feeRate: number,
): CyclePreview[] {
  return history.cycles.map((c) => {
    const target = addDays(c.halving, daysSinceHalving);
    const at = nearestWeek(c.weeks, target);
    const used = basket.filter((id) => c.coins[id]?.[at] != null);
    const missing = basket.filter((id) => !used.includes(id));
    const sellWindow: [string, string] = [
      addDays(c.next_halving, sellWindowDays[0]),
      addDays(c.next_halving, sellWindowDays[1]),
    ];

    const points: { week: string; btc: number }[] = [];
    for (let i = at; i < c.weeks.length && used.length; i++) {
      // a coin that stops trading counts as worth nothing from then on
      const avg = used.reduce((s, id) => s + (c.coins[id][i] ?? 0) / c.coins[id][at]!, 0) / used.length;
      points.push({ week: c.weeks[i], btc: avg * (1 - feeRate) });
    }
    const inWindow = points.filter((p) => p.week >= sellWindow[0] && p.week <= sellWindow[1]);
    const peak = points.reduce((best, p) => (p.btc > best.btc ? p : best), points[0] ?? { week: "", btc: 0 });
    return {
      label: `${c.weeks[at].slice(0, 4)} → ${sellWindow[1].slice(0, 4)}`,
      entryWeek: c.weeks[at],
      used,
      missing,
      points,
      low: Math.min(...points.map((p) => p.btc)),
      peak,
      atSellWindow: inWindow.length
        ? (inWindow.reduce((s, p) => s + p.btc, 0) / inWindow.length) * (1 - feeRate)
        : null,
      sellWindow,
      sellWindowWeeks: inWindow.length ? [inWindow[0].week, inWindow.at(-1)!.week] : null,
    };
  });
}

function nearestWeek(weeks: string[], day: string): number {
  let best = 0;
  for (let i = 1; i < weeks.length; i++) {
    if (Math.abs(daysBetween(weeks[i], day)) < Math.abs(daysBetween(weeks[best], day))) best = i;
  }
  return best;
}
