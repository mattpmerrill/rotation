import { balancesOn } from "./holdings";
import type { DraftTrade } from "./buyIn";
import { BTC, type Entry, type Trade } from "./types";

/**
 * Waiting slots. At the buy-in some picks can be slots that keep their share of the BTC as BTC.
 * Before any rebuy, a slot can be filled: exactly one slot's share of the waiting BTC is sold
 * and a new coin joins the basket. The database enforces the same (fill_slot()).
 */

/** Why the entry's slots can't be filled now, or null if one can. */
export function slotsClosedReason(entry: Entry, trades: Trade[]): string | null {
  if (entry.openSlots < 1) return "No waiting slots left.";
  if (trades.some((t) => t.kind === "rebuy")) return "Slots close once you start rebuying BTC.";
  return null;
}

/** BTC waiting in the slots (0 once rebuying has started: that BTC is the rebuy). */
export function waitingBtc(entry: Entry, trades: Trade[]): number {
  if (entry.openSlots < 1 || trades.some((t) => t.kind === "rebuy")) return 0;
  return balancesOn(entry, trades)[BTC];
}

/** One slot's share of the waiting BTC: what filling a slot sells. */
export function slotShare(entry: Entry, trades: Trade[]): number {
  return entry.openSlots ? waitingBtc(entry, trades) / entry.openSlots : 0;
}

/** The trades that fill a slot: sell one slot's share of BTC and spend it all on the coin. */
export function planFill(
  share: number,
  btcPriceUsd: number,
  coin: string,
  coinPriceUsd: number,
  feeRate: number,
): DraftTrade[] {
  const gross = share * btcPriceUsd;
  const sale: DraftTrade = { asset: BTC, side: "sell", qty: share, priceUsd: btcPriceUsd, feeUsd: gross * feeRate };
  const cost = (gross - sale.feeUsd) / (1 + feeRate);
  return [sale, { asset: coin, side: "buy", qty: cost / coinPriceUsd, priceUsd: coinPriceUsd, feeUsd: cost * feeRate }];
}
