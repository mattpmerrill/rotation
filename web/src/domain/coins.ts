import { balancesOn } from "./holdings";
import { priceOn } from "./prices";
import { RULES } from "./rules";
import { BTC, type Day, type Entry, type PriceBook, type Trade } from "./types";

/** How one basket coin has done since the buy-in. */
export interface CoinChange {
  asset: string;
  /** Average buy-in price, USD. */
  boughtAt: number;
  price: number;
  /** Change since the buy-in, in USD and against BTC (0.1 = +10%). */
  changeUsd: number;
  changeBtc: number;
  qty: number;
  valueUsd: number;
  status: "held" | "partly_sold" | "sold";
}

export function coinChanges(entry: Entry, trades: Trade[], prices: PriceBook, day: Day): CoinChange[] {
  // BTC's price at the buy-in: what the entry actually sold it for, if logged
  const btcAtStart =
    trades.find((t) => t.asset === BTC && t.side === "sell" && t.tradedOn === entry.startedOn)?.priceUsd ??
    priceOn(prices, BTC, entry.startedOn);
  const btcNow = priceOn(prices, BTC, day);
  const held = balancesOn(entry, trades);
  const out: CoinChange[] = [];
  for (const asset of entry.basket) {
    const buys = trades.filter((t) => t.asset === asset && t.side === "buy");
    const boughtQty = buys.reduce((s, t) => s + t.qty, 0);
    const price = priceOn(prices, asset, day);
    if (!boughtQty || price == null || !btcAtStart || !btcNow) continue;
    const boughtAt = buys.reduce((s, t) => s + t.qty * t.priceUsd, 0) / boughtQty;
    const qty = Math.max(0, held[asset] ?? 0);
    out.push({
      asset,
      boughtAt,
      price,
      changeUsd: price / boughtAt - 1,
      changeBtc: price / btcNow / (boughtAt / btcAtStart) - 1,
      qty,
      valueUsd: qty * price,
      status: qty <= RULES.dust.coin ? "sold" : qty < boughtQty * (1 - 1e-9) ? "partly_sold" : "held",
    });
  }
  return out.sort((a, b) => b.changeBtc - a.changeBtc);
}
