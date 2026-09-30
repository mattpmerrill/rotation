import { addDays } from "@/lib/days";
import type { CycleReference } from "./cycle";
import type { Day } from "./types";

/**
 * When buying alts has paid off (engine: `rotation buy-timing`, web/public/data/buy-timing.json).
 * Each point is a buy day: how many days after that cycle's halving it was, and the BTC per BTC
 * it turned into by the next old sell window (1% fee each way).
 */
export interface BuyTimingData {
  generated: string;
  entries: string[];
  /** The halving year each buy day belongs to (2016, 2020, 2024). */
  cycle: number[];
  day: number[];
  /** The ten biggest alts on the buy day, equal weight. Null: its sell window hasn't come yet. */
  top10: (number | null)[];
  coins: Record<string, (number | null)[]>;
}

export interface TimingPoint {
  entry: string;
  cycle: number;
  day: number;
  btc: number;
}

/** "top10" or a coin id -> its points with a result. */
export function timingPoints(data: BuyTimingData, key: string): TimingPoint[] {
  const values = key === "top10" ? data.top10 : data.coins[key];
  if (!values) return [];
  return values.flatMap((btc, i) => {
    const entry = data.entries[i];
    const cycle = data.cycle[i];
    const day = data.day[i];
    if (btc == null || entry === undefined || cycle === undefined || day === undefined) return [];
    return [{ entry, cycle, day, btc }];
  });
}

export type Verdict = "good" | "poor" | "mixed" | "unknown";

export interface Stance {
  verdict: Verdict;
  /** Median result per past cycle for buys near this day. */
  byCycle: { cycle: number; btc: number }[];
  /** Cycles where buying here beat holding BTC, out of the cycles with data. */
  wins: number;
  of: number;
  /** Median across those cycles' medians (null without data). */
  median: number | null;
}

/**
 * How buying around `day` (± `spread` days) went in each past cycle. Good: beat holding BTC in
 * most cycles with data (at least two cycles). Poor: lost in every one. Mixed: some of each.
 */
export function stanceAt(points: TimingPoint[], day: number, spread = 45): Stance {
  const near = points.filter((p) => Math.abs(p.day - day) <= spread);
  const cycles = [...new Set(near.map((p) => p.cycle))].sort();
  const byCycle = cycles.map((cycle) => ({
    cycle,
    btc: median(near.filter((p) => p.cycle === cycle).map((p) => p.btc)),
  }));
  const wins = byCycle.filter((c) => c.btc > 1).length;
  const verdict: Verdict =
    byCycle.length < 2 ? "unknown" : wins === 0 ? "poor" : wins / byCycle.length > 0.5 ? "good" : "mixed";
  return {
    verdict,
    byCycle,
    wins,
    of: byCycle.length,
    median: byCycle.length ? median(byCycle.map((c) => c.btc)) : null,
  };
}

export interface Stretch {
  from: number;
  to: number;
  stance: Stance;
}

/** The cycle in stretches of `size` days, each with how buying in it went. */
export function stretches(points: TimingPoint[], size = 90, cycleDays = 1456): Stretch[] {
  const out: Stretch[] = [];
  for (let from = 0; from < cycleDays; from += size) {
    const to = Math.min(from + size - 1, cycleDays - 1);
    out.push({ from, to, stance: stanceAt(points, (from + to) / 2, (to - from) / 2) });
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  const upper = s[m];
  if (upper === undefined) throw new Error("median of no values");
  return s.length % 2 ? upper : ((s[m - 1] ?? upper) + upper) / 2;
}

/** A stretch where buying beat holding BTC in most past cycles. */
export function isGoodStretch(s: Stretch): boolean {
  return s.stance.verdict === "good";
}

/**
 * The next run of good stretches after `today` (a day in the cycle), wrapping into the next
 * cycle. Back-to-back good stretches merge into one run; its stance is the weakest of them.
 */
export function nextGoodStretch(all: Stretch[], today: number): { stretch: Stretch; nextCycle: boolean } | null {
  const runs: Stretch[] = [];
  for (const s of all) {
    if (!isGoodStretch(s)) continue;
    const last = runs.at(-1);
    if (last && last.to + 1 === s.from) {
      const weaker = s.stance.wins / s.stance.of < last.stance.wins / last.stance.of ? s.stance : last.stance;
      runs[runs.length - 1] = { from: last.from, to: s.to, stance: weaker };
    } else runs.push(s);
  }
  const current = runs.find((r) => r.to >= today);
  if (current) return { stretch: current, nextCycle: false };
  const first = runs[0];
  return first ? { stretch: first, nextCycle: true } : null;
}

/** The calendar dates of the next good run of stretches, for the page to show. Days in the next
 *  cycle are counted from the estimated next halving. */
export function nextGoodWindow(
  all: Stretch[],
  cycle: Pick<CycleReference, "daysSinceHalving" | "lastHalving" | "nextHalvingEst">,
): { start: Day; end: Day; wins: number; of: number } | null {
  const next = nextGoodStretch(all, cycle.daysSinceHalving);
  if (!next) return null;
  const from = next.nextCycle ? cycle.nextHalvingEst : cycle.lastHalving;
  return {
    start: addDays(from, next.stretch.from),
    end: addDays(from, next.stretch.to),
    wins: next.stretch.stance.wins,
    of: next.stretch.stance.of,
  };
}
