import "server-only";
import { BTC, type Challenge, type Coin, type Entry, type PriceBook, type Trade } from "@/domain/types";
import { getCurrentChallenge, listEntries, listTrades } from "./challenge";
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
}

export async function loadCurrentChallenge(db?: Db): Promise<ChallengeSnapshot | null> {
  const challenge = await getCurrentChallenge(db);
  if (!challenge) return null;
  const entries = await listEntries(challenge.id, db);
  const trades = await listTrades(
    entries.map((e) => e.id),
    db,
  );
  const assets = [...new Set([BTC, ...entries.flatMap((e) => e.basket), ...trades.map((t) => t.asset)])];
  const from = entries.map((e) => e.startedOn).sort()[0] ?? challenge.openedOn;
  const [prices, coins] = await Promise.all([getPriceBook(assets, from, db), getCoins(assets, db)]);
  return { challenge, entries, trades, prices, coins };
}
