import { buyInFeeRate, type BuyInOverrides } from "@/domain/buy-in";
import { RULES } from "@/domain/rules";
import type { Entry, Trade } from "@/domain/types";

/** A saved buy-in to edit: the form starts from what was logged. */
export interface BuyInEdit {
  entryId: number;
  btcIn: number;
  startedOn: string;
  feeRate: number;
  /** The logged amounts and prices, by asset. */
  overrides: BuyInOverrides;
}

/** What the edit form starts from: the entry and the trades its buy-in logged. */
export function toBuyInEdit(entry: Entry, buyInTrades: Trade[]): BuyInEdit {
  return {
    entryId: entry.id,
    btcIn: entry.btcIn,
    startedOn: entry.startedOn,
    feeRate: buyInFeeRate(buyInTrades) ?? RULES.defaultFeeRate,
    overrides: Object.fromEntries(buyInTrades.map((t) => [t.asset, { qty: String(t.qty), price: String(t.priceUsd) }])),
  };
}
