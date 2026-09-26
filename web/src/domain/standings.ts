import { balancesOn, phaseOf } from "./holdings";
import { multiple, valueSeries, type ValuePoint } from "./valuation";
import type { Day, Entry, Phase, PriceBook, Trade } from "./types";

export interface Standing {
  entry: Entry;
  phase: Phase;
  /** Latest value; null if the entry can't be priced yet. */
  now: ValuePoint | null;
  multiple: number | null;
  best: number | null;
  worst: number | null;
  /** Value by day from the buy-in. */
  series: ValuePoint[];
  /** BTC multiple by day, for the sparkline. */
  history: { day: Day; multiple: number }[];
}

export function standingOf(entry: Entry, trades: Trade[], prices: PriceBook, today: Day): Standing {
  const series = valueSeries(entry, trades, prices, today);
  const history = series.map((p) => ({ day: p.day, multiple: multiple(entry, p) }));
  const multiples = history.map((h) => h.multiple);
  const now = series.at(-1) ?? null;
  return {
    entry,
    phase: phaseOf(balancesOn(entry, trades), trades),
    now,
    multiple: now ? multiple(entry, now) : null,
    best: multiples.length ? Math.max(...multiples) : null,
    worst: multiples.length ? Math.min(...multiples) : null,
    series,
    history,
  };
}

/** Highest BTC multiple first; entries that can't be priced go last. */
export function rankStandings(standings: Standing[]): Standing[] {
  return [...standings].sort(
    (a, b) =>
      (b.multiple ?? -Infinity) - (a.multiple ?? -Infinity) || a.entry.playerName.localeCompare(b.entry.playerName),
  );
}

/** The challenge is over when everyone who entered is back in BTC. */
export function isChallengeComplete(standings: Standing[]): boolean {
  return standings.length > 0 && standings.every((s) => s.phase === "back_in_btc");
}
