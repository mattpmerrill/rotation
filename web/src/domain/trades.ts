import type { DraftTrade } from "./buy-in";
import { formatQty } from "@/lib/format";
import { RULES } from "./rules";
import { USDT, type Balances, type Trade } from "./types";

/** The buy-in's own trades: the BTC sale and the basket buys at the start. */
export function isBuyInTrade(t: Trade): boolean {
  return t.kind === "buy_in";
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

/** The fee a trade of `qty` at `priceUsd` starts with, before a person types their real one. */
export function defaultTradeFee(qty: number, priceUsd: number): number {
  return qty * priceUsd * RULES.defaultFeeRate;
}

/** The BTC that all `usdt` buys at `priceUsd`, the default fee included, so nothing is left. */
export function rebuyAllQty(usdt: number, priceUsd: number): number {
  return usdt / (priceUsd * (1 + RULES.defaultFeeRate));
}
