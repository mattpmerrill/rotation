import "server-only";
import { getCurrentChallenge } from "@/data/challenges.repository";
import { findEntryFor, getEntry } from "@/data/entries.repository";
import { listTrades } from "@/data/trades.repository";
import { buyInWindow, editLockedReason, editWindow } from "@/domain/buy-in";
import { getCoins, getEligibleCoins, getPriceBook } from "@/data/prices.repository";
import { marketReference } from "@/data/reference.repository";
import type { Viewer } from "@/data/viewer";
import type { EligibleCoin } from "@/domain/basket";
import { cycleReference } from "@/domain/cycle";
import { BTC, type Challenge, type Entry, type PriceBook, type Trade } from "@/domain/types";
import { addDays, todayUtc } from "@/lib/days";
import { editableCoins } from "./editable-coins";

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
  const window = editWindow(challenge.openedOn, entry.startedOn, today);
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
  const [from] = buyInWindow(challenge.openedOn, today);
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
