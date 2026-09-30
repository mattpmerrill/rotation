import "server-only";
import { getCoins } from "@/data/prices.repository";
import { marketReference } from "@/data/reference.repository";
import { buyTiming } from "@/data/timing.repository";
import { cycleReference, type CycleReference } from "@/domain/cycle";
import { stanceAt, stretches, timingPoints, type Stance, type Stretch, type TimingPoint } from "@/domain/timing";
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
  coin: TimingView | null;
  /** Coins with results in at least two cycles, for the picker. */
  coinOptions: Coin[];
}

/** Buying alts by point in the cycle: the market (top 10 at the time) and, optionally, one coin. */
export async function getTiming(coinId: string | null): Promise<TimingPage> {
  const { halvings, halvingIntervalDays, sellWindowDays } = marketReference;
  const cycle = cycleReference(halvings, halvingIntervalDays, sellWindowDays, todayUtc());
  const withHistory = Object.keys(buyTiming.coins).filter(
    (id) => new Set(timingPoints(buyTiming, id).map((p) => p.cycle)).size >= 2,
  );
  const coins = await getCoins(withHistory);
  const view = (key: string, label: string, coin: Coin | null): TimingView => {
    const points = timingPoints(buyTiming, key);
    return { key, label, coin, points, now: stanceAt(points, cycle.daysSinceHalving), stretches: stretches(points) };
  };
  const chosen = coinId && coins[coinId] ? coins[coinId] : null;
  return {
    cycle,
    market: view("top10", "The top 10 alts", null),
    coin: chosen ? view(chosen.id, chosen.symbol, chosen) : null,
    coinOptions: withHistory.flatMap((id) => {
      const coin = coins[id];
      return coin ? [coin] : [];
    }),
  };
}
