import "server-only";
import { getCurrentChallenge } from "@/data/challenges.repository";
import { findEntryFor } from "@/data/entries.repository";
import { getEligibleCoins, getPriceBook } from "@/data/prices.repository";
import { getMarketState } from "@/data/market.repository";
import { cycleOn, marketReference } from "@/data/reference.repository";
import { env } from "@/data/env";
import { loadCurrentChallenge } from "@/data/snapshot.repository";
import type { Viewer } from "@/domain/viewer";
import { coinChanges, type CoinChange } from "@/domain/coins";
import type { CycleReference } from "@/domain/cycle";
import { altHoldings, balancesOn } from "@/domain/holdings";
import { editLockedReason } from "@/domain/buy-in";
import { slotShare, slotsClosedReason, waitingBtc } from "@/domain/slots";
import { isFinished, standingOf, type Standing } from "@/domain/standings";
import { BTC, USDT, type Coin, type Entry, type MarketState, type PriceBook, type Trade } from "@/domain/types";
import type { EligibleCoin } from "@/domain/basket";
import { getLivePrices } from "@/integrations/coingecko";
import { addDays, laterDay, todayUtc } from "@/lib/days";
import { integerParam } from "@/lib/integer-param";

/** Today's prices from CoinGecko, cached a minute; null (daily closes only) if it is down. */
const liveQuotes = (ids: string[]) => getLivePrices(ids, { apiKey: env().COINGECKO_API_KEY });

export interface EntryView {
  entry: Entry;
  isOwner: boolean;
  /** The entry is back in BTC: its score is final. */
  finished: boolean;
  /** The owner can still redo the buy-in (nothing has been logged since). */
  editable: boolean;
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

/** One entry in the current challenge, valued as of today. Null if `idParam` (the URL segment)
 *  isn't an entry in it. */
export async function getEntryView(idParam: string, viewer: Viewer): Promise<EntryView | null> {
  const entryId = integerParam(idParam);
  if (entryId === null) return null;
  const [snap, market] = await Promise.all([loadCurrentChallenge(undefined, { liveQuotes }), getMarketState()]);
  const entry = snap?.entries.find((e) => e.id === entryId);
  if (!snap || !entry) return null;
  const today = todayUtc();
  const trades = snap.trades.filter((t) => t.entryId === entry.id);
  const balances = balancesOn(entry, trades);
  const assets = [BTC, ...entry.basket];
  const closedReason = slotsClosedReason(entry, trades);
  const isOwner = entry.userId === viewer.id;
  const standing = standingOf(entry, trades, snap.prices, today);
  return {
    entry,
    isOwner,
    finished: isFinished(standing),
    editable: isOwner && !editLockedReason(trades),
    standing,
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
    cycle: cycleOn(today),
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

/** The viewer's entry in the current challenge, if they're a member and have started one. */
export async function getMyEntryId(viewer: Viewer): Promise<number | null> {
  if (!viewer.isMember) return null;
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
