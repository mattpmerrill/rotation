import "server-only";
import { findEntryFor, getCurrentChallenge } from "@/data/challenge";
import { getEligibleCoins, getPriceBook } from "@/data/prices";
import { marketReference } from "@/data/reference";
import type { Viewer } from "@/data/viewer";
import type { EligibleCoin } from "@/domain/basket";
import { cycleReference } from "@/domain/cycle";
import { BTC, type Challenge, type PriceBook } from "@/domain/types";
import { addDays, todayUtc } from "@/lib/days";
import { BUY_IN_LOOKBACK_DAYS } from "./schema";

export type PickerData =
  | { status: "no_challenge" }
  | { status: "already_in"; entryId: number }
  | {
      status: "ready";
      challenge: Challenge;
      coins: EligibleCoin[];
      ranksAsOf: string | null;
      daysSinceHalving: number;
      sellWindowDays: [number, number];
      /** Earliest and latest day the buy-in can be dated. */
      window: [string, string];
      /** Closes for BTC and every eligible coin over the window, to fill buy-in prices. */
      prices: PriceBook;
    };

export async function getPickerData(viewer: Viewer): Promise<PickerData> {
  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.closedOn) return { status: "no_challenge" };
  const existing = await findEntryFor(viewer.id, challenge.id);
  if (existing) return { status: "already_in", entryId: existing.id };

  const today = todayUtc();
  const from = [challenge.openedOn, addDays(today, -BUY_IN_LOOKBACK_DAYS)].sort().at(-1)!;
  const { coins, asOf } = await getEligibleCoins();
  const prices = await getPriceBook([BTC, ...coins.map((c) => c.id)], addDays(from, -7));
  return {
    status: "ready",
    challenge,
    coins,
    ranksAsOf: asOf,
    daysSinceHalving: cycleReference(
      marketReference.halvings,
      marketReference.halvingIntervalDays,
      marketReference.sellWindowDays,
      today,
    ).daysSinceHalving,
    sellWindowDays: marketReference.sellWindowDays,
    window: [from, today],
    prices,
  };
}
