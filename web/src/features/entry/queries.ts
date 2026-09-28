import "server-only";
import { getCurrentChallenge } from "@/data/challenges";
import { findEntryFor } from "@/data/entries";
import { getEligibleCoins, getPriceBook } from "@/data/prices";
import { getMarketState } from "@/data/market";
import { marketReference } from "@/data/reference";
import { loadCurrentChallenge } from "@/data/snapshot";
import type { Viewer } from "@/data/viewer";
import { coinChanges, type CoinChange } from "@/domain/coins";
import { cycleReference, type CycleReference } from "@/domain/cycle";
import { altHoldings, balancesOn } from "@/domain/holdings";
import { slotShare, slotsClosedReason, waitingBtc } from "@/domain/slots";
import { standingOf, type Standing } from "@/domain/standings";
import { BTC, USDT, type Coin, type Entry, type MarketState, type PriceBook, type Trade } from "@/domain/types";
import type { EligibleCoin } from "@/domain/basket";
import { addDays, laterDay, todayUtc } from "@/lib/days";

export interface EntryView {
  entry: Entry;
  isOwner: boolean;
  standing: Standing;
  coins: Record<string, Coin>;
  changes: CoinChange[];
  trades: Trade[];
  /** What the entry holds now: alts by coin, and USDT in dollars. */
  holdings: { alts: Record<string, number>; usdt: number };
  /** Prices for the entry's assets since the buy-in (the trade form fills prices from these). */
  prices: PriceBook;
  cycle: CycleReference;
  market: MarketState | null;
  slots: {
    open: number;
    waitingBtc: number;
    /** BTC one fill sells. */
    share: number;
    /** Why no slot can be filled now, or null. */
    closedReason: string | null;
    /** For the owner's fill form: today's top 100 (minus the basket) and their recent closes. */
    fill: { coins: EligibleCoin[]; prices: PriceBook; from: string } | null;
  };
  rebuyRule: typeof marketReference.rebuy;
  /** When the live prices behind `standing.now` were quoted, or null for daily closes. */
  liveAt: number | null;
}

/** One entry in the current challenge, valued as of today. Null if it isn't in it. */
export async function getEntryView(entryId: number, viewer: Viewer): Promise<EntryView | null> {
  const [snap, market] = await Promise.all([loadCurrentChallenge(undefined, { live: true }), getMarketState()]);
  const entry = snap?.entries.find((e) => e.id === entryId);
  if (!snap || !entry) return null;
  const today = todayUtc();
  const trades = snap.trades.filter((t) => t.entryId === entry.id);
  const balances = balancesOn(entry, trades);
  const assets = [BTC, ...entry.basket];
  const closedReason = slotsClosedReason(entry, trades);
  const isOwner = entry.userId === viewer.id;
  return {
    entry,
    isOwner,
    standing: standingOf(entry, trades, snap.prices, today),
    coins: snap.coins,
    changes: coinChanges(entry, trades, snap.prices, today),
    trades,
    holdings: { alts: altHoldings(balances), usdt: balances[USDT] },
    prices: Object.fromEntries(
      assets.flatMap((a) => {
        const series = snap.prices[a];
        return series ? [[a, series]] : [];
      }),
    ),
    cycle: cycleReference(
      marketReference.halvings,
      marketReference.halvingIntervalDays,
      marketReference.sellWindowDays,
      today,
    ),
    market,
    rebuyRule: marketReference.rebuy,
    liveAt: snap.liveAt,
    slots: {
      open: entry.openSlots,
      waitingBtc: waitingBtc(entry, trades),
      share: slotShare(entry, trades),
      closedReason,
      fill: isOwner && !closedReason ? await fillOptions(entry, today) : null,
    },
  };
}

/** The viewer's entry in the current challenge, if they've started one. */
export async function getMyEntryId(viewer: Viewer): Promise<number | null> {
  const challenge = await getCurrentChallenge();
  if (!challenge) return null;
  return (await findEntryFor(viewer.id, challenge.id))?.id ?? null;
}

/** A slot can be filled with any of today's top 100 not already in the basket, dated up to
 *  30 days back (and not before the buy-in). */
async function fillOptions(entry: Entry, today: string) {
  const from = laterDay(entry.startedOn, addDays(today, -30));
  const { coins } = await getEligibleCoins();
  const candidates = coins.filter((c) => !entry.basket.includes(c.id));
  const prices = await getPriceBook([BTC, ...candidates.map((c) => c.id)], addDays(from, -7));
  return { coins: candidates, prices, from };
}
