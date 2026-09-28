import "server-only";
import { BTC, type Challenge, type Coin, type Entry, type PriceBook, type Trade } from "@/domain/types";
import { getCurrentChallenge, listEntries } from "./challenge";
import { listTrades } from "./trades";
import { withLivePrices } from "@/domain/prices";
import { todayUtc } from "@/lib/days";
import { getLivePrices } from "./live";
import { getCoins, getPriceBook } from "./prices";
import type { Db } from "./supabase/server";

/** Everything needed to value a challenge's entries: the entries, their trades, and daily
 *  prices for BTC and every coin they picked or traded since the first buy-in. */
export interface ChallengeSnapshot {
  challenge: Challenge;
  entries: Entry[];
  trades: Trade[];
  prices: PriceBook;
  coins: Record<string, Coin>;
  /** When today's live prices were quoted (epoch ms), or null if they're daily closes only. */
  liveAt: number | null;
}

/** `live` adds today's prices from CoinGecko (cached a minute) on top of the daily closes, for
 *  pages people watch. The daily job leaves it off so its numbers match the stored closes. */
export async function loadCurrentChallenge(
  db?: Db,
  { live = false }: { live?: boolean } = {},
): Promise<ChallengeSnapshot | null> {
  const challenge = await getCurrentChallenge(db);
  if (!challenge) return null;
  const entries = await listEntries(challenge.id, db);
  const trades = await listTrades(
    entries.map((e) => e.id),
    db,
  );
  const assets = [...new Set([BTC, ...entries.flatMap((e) => e.basket), ...trades.map((t) => t.asset)])];
  const from = entries.map((e) => e.startedOn).sort()[0] ?? challenge.openedOn;
  const [daily, coins, quotes] = await Promise.all([
    getPriceBook(assets, from, db),
    getCoins(assets, db),
    live ? getLivePrices(assets) : null,
  ]);
  const prices = quotes ? withLivePrices(daily, quotes.prices, todayUtc()) : daily;
  return { challenge, entries, trades, prices, coins, liveAt: quotes?.at ?? null };
}
