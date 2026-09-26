import type { DraftTrade } from "./buyIn";
import { formatQty } from "@/lib/format";
import { BTC, USDT, type Balances, type Entry, type Trade } from "./types";

/** The buy-in's own trades: the BTC sale and the basket buys on the start day. */
export function isBuyInTrade(entry: Entry, t: Trade): boolean {
  if (t.tradedOn !== entry.startedOn) return false;
  return t.asset === BTC ? t.side === "sell" : t.side === "buy";
}

/**
 * Why a new sell or rebuy can't go through, or null if it can. The database enforces the same
 * limits; this says it in words a person can act on.
 */
export function checkTrade(b: Balances, t: DraftTrade, symbol: string): string | null {
  if (t.side === "sell") {
    const held = b[t.asset] ?? 0;
    if (t.qty > held * (1 + 1e-12)) return `You hold ${formatQty(held)} ${symbol}, so you can sell up to that.`;
    return null;
  }
  const cost = t.qty * t.priceUsd + t.feeUsd;
  if (cost > b[USDT] + 0.01)
    return `That costs $${cost.toFixed(2)} with the fee; you hold $${b[USDT].toFixed(2)} in USDT.`;
  return null;
}
