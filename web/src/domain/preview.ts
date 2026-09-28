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

/** One coin inside a cycle preview. */
export interface CoinPreview {
  id: string;
  /** Set when the coin had no price yet at the entry week: its share waited as BTC and
   *  bought in at its first weekly price, this week. */
  boughtLate: string | null;
  /** No price at all from the entry week on: its share stayed in BTC the whole time. */
  neverListed: boolean;
  /** BTC per BTC put into this coin, in the old sell window (both fees paid). */
  atSellWindow: number | null;
}

export interface CyclePreview {
  /** e.g. "2018 → 2021" */
  label: string;
  entryWeek: string;
  coins: CoinPreview[];
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
 *
 * Each coin gets an equal share of the BTC. A coin that didn't exist yet at the entry week
 * holds its share as BTC until its first weekly price, then buys in (Matt, 2026-09-26). A
 * coin whose prices stop counts as worth nothing from then on.
 */
export function previewBasket(
  history: BasketHistory,
  basket: string[],
  daysSinceHalving: number,
  sellWindowDays: [number, number],
  feeRate: number,
): CyclePreview[] {
  return history.cycles.flatMap((c): CyclePreview[] => {
    const at = nearestWeek(c.weeks, addDays(c.halving, daysSinceHalving));
    const entryWeek = c.weeks[at];
    if (entryWeek === undefined) return []; // a cycle with no weeks has nothing to preview
    const weeks = c.weeks.slice(at);
    const sellWindow: [string, string] = [
      addDays(c.next_halving, sellWindowDays[0]),
      addDays(c.next_halving, sellWindowDays[1]),
    ];
    const inWindow = weeks.flatMap((w, k) => (w >= sellWindow[0] && w <= sellWindow[1] ? [k] : []));
    const windowAvg = (line: number[]) =>
      inWindow.length
        ? (inWindow.reduce((s, k) => s + (line[k] ?? 0), 0) / inWindow.length) * (1 - feeRate) ** 2
        : null;

    const held = basket.map((id) => ({ id, line: coinLine(c.coins[id] ?? [], at, c.weeks.length) }));
    const points = weeks.map((week, k) => ({
      week,
      btc: held.length ? (held.reduce((s, h) => s + (h.line.values[k] ?? 0), 0) / held.length) * (1 - feeRate) : 0,
    }));
    const peak = points.reduce((best, p) => (p.btc > best.btc ? p : best), points[0] ?? { week: "", btc: 0 });
    const total = windowAvg(points.map((p) => p.btc / (1 - feeRate)));

    const firstInWindow = inWindow[0];
    const lastInWindow = inWindow.at(-1);
    const shadeFrom = firstInWindow === undefined ? undefined : weeks[firstInWindow];
    const shadeTo = lastInWindow === undefined ? undefined : weeks[lastInWindow];

    return [
      {
        label: `${entryWeek.slice(0, 4)} → ${sellWindow[1].slice(0, 4)}`,
        entryWeek,
        coins: held.map(({ id, line }) => ({
          id,
          boughtLate: line.buy != null && line.buy > at ? (c.weeks[line.buy] ?? null) : null,
          neverListed: line.buy == null,
          atSellWindow: windowAvg(line.values),
        })),
        points,
        low: points.length ? Math.min(...points.map((p) => p.btc)) : 0,
        peak,
        atSellWindow: total,
        sellWindow,
        sellWindowWeeks: shadeFrom !== undefined && shadeTo !== undefined ? [shadeFrom, shadeTo] : null,
      },
    ];
  });
}

/** One coin's value in BTC per BTC put in, from the entry week on (before fees). */
function coinLine(prices: (number | null)[], at: number, length: number): { values: number[]; buy: number | null } {
  let buy: number | null = null;
  let last = -1;
  for (let i = 0; i < prices.length; i++) {
    if (prices[i] == null) continue;
    if (buy == null && i >= at) buy = i;
    last = i;
  }
  const values: number[] = [];
  let prev = 1;
  for (let i = at; i < length; i++) {
    if (buy == null || i < buy)
      values.push(1); // not listed yet: the share waits as BTC
    else if (i > last)
      values.push(0); // stopped trading
    else {
      const price = prices[i];
      const first = prices[buy];
      prev = price != null && first != null ? price / first : prev; // a missing week keeps its last value
      values.push(prev);
    }
  }
  return { values, buy };
}

function nearestWeek(weeks: string[], day: string): number {
  let best = 0;
  for (let i = 1; i < weeks.length; i++) {
    const week = weeks[i];
    const current = weeks[best];
    if (week === undefined || current === undefined) continue;
    if (Math.abs(daysBetween(week, day)) < Math.abs(daysBetween(current, day))) best = i;
  }
  return best;
}
