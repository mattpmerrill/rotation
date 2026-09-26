import "server-only";
import { findEntryFor, getCurrentChallenge } from "@/data/challenge";
import { getMarketState, type MarketState } from "@/data/market";
import { marketReference } from "@/data/reference";
import { loadCurrentChallenge } from "@/data/snapshot";
import type { Viewer } from "@/data/viewer";
import { coinChanges, type CoinChange } from "@/domain/coins";
import { cycleReference, type CycleReference } from "@/domain/cycle";
import { altHoldings, balancesOn } from "@/domain/holdings";
import { standingOf, type Standing } from "@/domain/standings";
import { BTC, USDT, type Coin, type Entry, type PriceBook, type Trade } from "@/domain/types";
import { todayUtc } from "@/lib/days";

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
  rebuyRule: typeof marketReference.rebuy;
}

/** One entry in the current challenge, valued as of today. Null if it isn't in it. */
export async function getEntryView(entryId: number, viewer: Viewer): Promise<EntryView | null> {
  const [snap, market] = await Promise.all([loadCurrentChallenge(), getMarketState()]);
  const entry = snap?.entries.find((e) => e.id === entryId);
  if (!snap || !entry) return null;
  const today = todayUtc();
  const trades = snap.trades.filter((t) => t.entryId === entry.id);
  const balances = balancesOn(entry, trades);
  const assets = [BTC, ...entry.basket];
  return {
    entry,
    isOwner: entry.userId === viewer.id,
    standing: standingOf(entry, trades, snap.prices, today),
    coins: snap.coins,
    changes: coinChanges(entry, trades, snap.prices, today),
    trades,
    holdings: { alts: altHoldings(balances), usdt: balances[USDT] },
    prices: Object.fromEntries(assets.filter((a) => snap.prices[a]).map((a) => [a, snap.prices[a]])),
    cycle: cycleReference(
      marketReference.halvings,
      marketReference.halvingIntervalDays,
      marketReference.sellWindowDays,
      today,
    ),
    market,
    rebuyRule: marketReference.rebuy,
  };
}

/** The viewer's entry in the current challenge, if they've started one. */
export async function getMyEntryId(viewer: Viewer): Promise<number | null> {
  const challenge = await getCurrentChallenge();
  if (!challenge) return null;
  return (await findEntryFor(viewer.id, challenge.id))?.id ?? null;
}
