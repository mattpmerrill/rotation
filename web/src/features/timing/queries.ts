import "server-only";
import { getCoins } from "@/data/prices.repository";
import { cycleOn } from "@/data/reference.repository";
import { buyTiming } from "@/data/timing.repository";
import type { CycleReference } from "@/domain/cycle";
import {
  nextGoodWindow,
  stanceAt,
  stretches,
  timingPoints,
  type Stance,
  type Stretch,
  type TimingPoint,
} from "@/domain/timing";
import type { Coin } from "@/domain/types";
import { todayUtc } from "@/lib/days";

export interface TimingView {
  key: string;
  label: string;
  coin: Coin | null;
  points: TimingPoint[];
  now: Stance;
  stretches: Stretch[];
}

export interface TimingPage {
  cycle: CycleReference;
  market: TimingView;
  /** The next run of stretches that beat BTC in most past cycles, with its dates. */
  nextGood: ReturnType<typeof nextGoodWindow>;
  coin: TimingView | null;
  /** Coins with results in at least two cycles, for the picker. */
  coinOptions: Coin[];
}

/** Buying alts by point in the cycle: the market (top 10 at the time) and, optionally, one coin. */
export async function getTiming(coinId: string | null): Promise<TimingPage> {
  const cycle = cycleOn(todayUtc());
  const withHistory = Object.keys(buyTiming.coins).filter(
    (id) => new Set(timingPoints(buyTiming, id).map((p) => p.cycle)).size >= 2,
  );
  const coins = await getCoins(withHistory);
  const view = (key: string, label: string, coin: Coin | null): TimingView => {
    const points = timingPoints(buyTiming, key);
    return { key, label, coin, points, now: stanceAt(points, cycle.daysSinceHalving), stretches: stretches(points) };
  };
  const chosen = coinId && coins[coinId] ? coins[coinId] : null;
  const market = view("top10", "The top 10 alts", null);
  return {
    cycle,
    market,
    nextGood: nextGoodWindow(market.stretches, cycle),
    coin: chosen ? view(chosen.id, chosen.symbol, chosen) : null,
    coinOptions: withHistory.flatMap((id) => {
      const coin = coins[id];
      return coin ? [coin] : [];
    }),
  };
}

/** What the basket picker's one-line reminder needs: how buying the top 10 alts at this point in
 *  the cycle went before. Null when there is no history to go on. */
export async function getTimingNote(): Promise<{ wins: number; of: number; day: number } | null> {
  const { market, cycle } = await getTiming(null);
  const { wins, of } = market.now;
  return of ? { wins, of, day: cycle.daysSinceHalving } : null;
}
