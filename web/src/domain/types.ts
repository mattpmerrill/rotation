/**
 * The challenge's vocabulary. Pure data: no framework, no I/O.
 *
 * Assets are CoinGecko ids ("bitcoin", "solana", ...). USDT is never traded directly: it is
 * the cash leg of every buy and sell, so it appears only in balances.
 */

export const BTC = "bitcoin";
export const USDT = "usdt";

/** A calendar day in UTC, as YYYY-MM-DD. Sorts correctly as a string. */
export type Day = string;

export type Side = "buy" | "sell";

/**
 * What a trade was for. The database lets people log only sells and rebuys themselves;
 * buy-ins and slot fills go through their own functions.
 *   buy_in  the start: BTC sold, basket bought     fill   a waiting slot filled: BTC sold, coin bought
 *   sell    an alt sold for USDT                   rebuy  BTC bought with USDT
 */
export type TradeKind = "buy_in" | "fill" | "sell" | "rebuy";

export interface Trade {
  id: number;
  entryId: number;
  tradedOn: Day;
  asset: string;
  side: Side;
  qty: number;
  priceUsd: number;
  feeUsd: number;
  kind: TradeKind;
  note: string | null;
}

/** One person's run at the challenge: BTC in, a basket, and their trades. */
export interface Entry {
  id: number;
  challengeId: number;
  userId: string;
  playerName: string;
  startedOn: Day;
  btcIn: number;
  basket: string[];
  /** Picks still waiting as BTC, to be filled with a coin later. */
  openSlots: number;
}

export interface Challenge {
  id: number;
  name: string;
  openedOn: Day;
  closedOn: Day | null;
}

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  /** Icon URL (CoinGecko), if known. */
  image: string | null;
}

/** Daily closes per asset, dates ascending. */
export type PriceBook = Record<string, { dates: Day[]; closes: number[] }>;

/** Holdings per asset (coin units; USDT in dollars). BTC and USDT are always present; any other
 *  asset is present only once it has been traded. */
export type Balances = { [BTC]: number; [USDT]: number } & Record<string, number | undefined>;

/**
 * Where an entry is in the challenge:
 *   holding_alts  still holds some of the basket
 *   holding_usdt  sold the alts; waiting for (or part-way through) the rebuy
 *   back_in_btc   rebought BTC with everything: the score is final
 */
export type Phase = "holding_alts" | "holding_usdt" | "back_in_btc";

/** BTC against its all-time high, as the daily job records it. The rebuy window is open when
 *  BTC has fallen far enough from its high, for long enough (config/rules.yaml). */
export interface MarketState {
  day: Day;
  btcPrice: number;
  ath: number;
  athDate: Day;
  /** How far below the high, as a fraction (0.62 = 62% below). */
  drawdown: number;
  daysSinceAth: number;
  mvrv: number | null;
  rebuyWindowOpen: boolean;
}
