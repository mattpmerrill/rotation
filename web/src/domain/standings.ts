import { balancesOn, phaseOf } from "./holdings";
import { multiple, valueSeries, type ValuePoint } from "./valuation";
import { BTC, type Day, type Entry, type Phase, type PriceBook, type Trade } from "./types";

export interface Standing {
  entry: Entry;
  phase: Phase;
  /** What the BTC put in was worth in dollars at the buy-in. */
  startUsd: number;
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
    startUsd: startValueUsd(entry, trades, series[0]?.btcPrice),
    now,
    multiple: now ? multiple(entry, now) : null,
    best: multiples.length ? Math.max(...multiples) : null,
    worst: multiples.length ? Math.min(...multiples) : null,
    series,
    history,
  };
}

/** What the BTC put in was worth in dollars at the start: the price the buy-in sold BTC at, else
 *  BTC's close on the first priced day (an entry whose buy-in sale was dated another day). */
export function startValueUsd(entry: Entry, trades: Trade[], firstBtcClose: number | undefined): number {
  const sale = trades.find((t) => t.asset === BTC && t.side === "sell" && t.tradedOn === entry.startedOn);
  return entry.btcIn * (sale?.priceUsd ?? firstBtcClose ?? 0);
}

/** The score is final once an entry is back in BTC. */
export function isFinished(standing: Pick<Standing, "phase">): boolean {
  return standing.phase === "back_in_btc";
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
  return standings.length > 0 && standings.every(isFinished);
}
