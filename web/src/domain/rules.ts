/**
 * The challenge rules (Matt, 2026-09-26). The database enforces the same limits
 * (supabase/migrations/..._challenge.sql and ..._waiting_slots.sql); keep the two in step.
 */
export const RULES = {
  /** Most BTC a person can put into the challenge. */
  maxBtcIn: 1,
  /** Picks per basket: coins plus waiting slots. At least one pick is a coin. */
  basketMin: 2,
  basketMax: 8,
  /** A coin must rank in the top N by market cap on the buy-in day. */
  maxRank: 100,
  /** A buy-in can be logged up to this many days after it happened. An app rule: the database only
   *  requires that it isn't before the challenge opened. */
  buyInLookbackDays: 30,
  /** Default trading fee, as a share of each trade (the group's exchange charges 1%). */
  defaultFeeRate: 0.01,
  /** Below this a balance counts as empty (coin units; dollars for USDT). */
  dust: { coin: 1e-9, usdt: 1 },
} as const;
