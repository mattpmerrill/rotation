import "server-only";
import { findEntryFor, getCurrentChallenge, getEntry, listTrades } from "@/data/challenge";
import { editLockedReason } from "@/domain/buy-in";
import { getCoins, getEligibleCoins, getPriceBook } from "@/data/prices";
import { marketReference } from "@/data/reference";
import type { Viewer } from "@/data/viewer";
import type { EligibleCoin } from "@/domain/basket";
import { cycleReference } from "@/domain/cycle";
import { BTC, type Challenge, type Entry, type PriceBook, type Trade } from "@/domain/types";
import { addDays, earlierDay, laterDay, todayUtc } from "@/lib/days";
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
      /** BTC's icon, for waiting slots. */
      btcIcon: string | null;
    };

/** Days an edited buy-in can be dated: the usual window, stretched back to the current buy-in. */
export function editWindow(openedOn: string, startedOn: string): [string, string] {
  const today = todayUtc();
  const usual = laterDay(openedOn, addDays(today, -BUY_IN_LOOKBACK_DAYS));
  return [earlierDay(usual, startedOn), today];
}

/** Coins an edited basket can hold: today's top 100, plus the coins already in it (a coin that
 *  has since dropped out of the top 100 can stay). */
export async function editableCoins(basket: string[]): Promise<EligibleCoin[]> {
  const { coins } = await getEligibleCoins();
  const missing = basket.filter((id) => !coins.some((c) => c.id === id));
  if (!missing.length) return coins;
  const extra = await getCoins(missing);
  return [
    ...coins,
    ...missing.map((id) => ({
      id,
      symbol: extra[id]?.symbol ?? id,
      name: extra[id]?.name ?? id,
      image: extra[id]?.image ?? null,
      rank: 0, // already held: allowed whatever its rank today
    })),
  ];
}

export type EditData =
  | { status: "locked"; reason: string }
  | {
      status: "ready";
      entry: Entry;
      coins: EligibleCoin[];
      daysSinceHalving: number;
      sellWindowDays: [number, number];
      window: [string, string];
      prices: PriceBook;
      btcIcon: string | null;
      /** The saved buy-in, to start the form from. */
      buyIn: { trades: Trade[] };
    };

/** Everything the edit page needs, or null if the entry isn't the viewer's. */
export async function getEditData(entryId: number, viewer: Viewer): Promise<EditData | null> {
  const entry = await getEntry(entryId);
  if (!entry || entry.userId !== viewer.id) return null;
  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.id !== entry.challengeId || challenge.closedOn)
    return { status: "locked", reason: "This challenge has closed." };
  const trades = await listTrades([entry.id]);
  const locked = editLockedReason(trades);
  if (locked) return { status: "locked", reason: locked };

  const today = todayUtc();
  const window = editWindow(challenge.openedOn, entry.startedOn);
  const coins = await editableCoins(entry.basket);
  const [prices, btc] = await Promise.all([
    getPriceBook([BTC, ...coins.map((c) => c.id)], addDays(window[0], -7)),
    getCoins([BTC]),
  ]);
  return {
    status: "ready",
    entry,
    coins,
    daysSinceHalving: cycleReference(
      marketReference.halvings,
      marketReference.halvingIntervalDays,
      marketReference.sellWindowDays,
      today,
    ).daysSinceHalving,
    sellWindowDays: marketReference.sellWindowDays,
    window,
    prices,
    btcIcon: btc[BTC]?.image ?? null,
    buyIn: { trades },
  };
}

export async function getPickerData(viewer: Viewer): Promise<PickerData> {
  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.closedOn) return { status: "no_challenge" };
  const existing = await findEntryFor(viewer.id, challenge.id);
  if (existing) return { status: "already_in", entryId: existing.id };

  const today = todayUtc();
  const from = laterDay(challenge.openedOn, addDays(today, -BUY_IN_LOOKBACK_DAYS));
  const { coins, asOf } = await getEligibleCoins();
  const [prices, btc] = await Promise.all([
    getPriceBook([BTC, ...coins.map((c) => c.id)], addDays(from, -7)),
    getCoins([BTC]),
  ]);
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
    btcIcon: btc[BTC]?.image ?? null,
  };
}
