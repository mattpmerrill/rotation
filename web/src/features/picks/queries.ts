import "server-only";
import { basketHistory } from "@/data/history.repository";
import { getCoins } from "@/data/prices.repository";
import { marketReference } from "@/data/reference.repository";
import { cycleReference } from "@/domain/cycle";
import { previewBasket, type CyclePreview } from "@/domain/preview";
import { RULES } from "@/domain/rules";
import type { Coin } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { PICKS, type Pick } from "./picks";

export interface PickView extends Pick {
  cycles: CyclePreview[];
}

/** Each pick with its past-cycle results, from today's point in the cycle. */
export async function getPicks(): Promise<{
  picks: PickView[];
  coins: Record<string, Coin>;
  daysSinceHalving: number;
}> {
  const { halvings, halvingIntervalDays, sellWindowDays } = marketReference;
  const { daysSinceHalving } = cycleReference(halvings, halvingIntervalDays, sellWindowDays, todayUtc());
  const coins = await getCoins(PICKS.flatMap((p) => p.basket));
  return {
    daysSinceHalving,
    coins,
    picks: PICKS.map((p) => ({
      ...p,
      cycles: previewBasket(basketHistory, p.basket, daysSinceHalving, sellWindowDays, RULES.defaultFeeRate),
    })),
  };
}
