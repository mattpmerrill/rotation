import { eachDay } from "@/lib/days";
import { altHoldings, balancesOn } from "./holdings";
import { priceOn } from "./prices";
import { BTC, USDT, type Day, type Entry, type PriceBook, type Trade } from "./types";

/** An entry's value on one day, split into what it holds. USD figures use that day's closes. */
export interface ValuePoint {
  day: Day;
  btcPrice: number;
  altsUsd: number;
  usdt: number;
  btcQty: number;
  totalUsd: number;
  /** The headline number: everything in the entry, priced in BTC. */
  totalBtc: number;
}

/** The entry's value on `day`, or null when BTC or a held coin has no price yet. */
export function valueOn(entry: Entry, trades: Trade[], prices: PriceBook, day: Day): ValuePoint | null {
  const btcPrice = priceOn(prices, BTC, day);
  if (!btcPrice) return null;
  const b = balancesOn(entry, trades, day);
  let altsUsd = 0;
  for (const [asset, qty] of Object.entries(altHoldings(b))) {
    const p = priceOn(prices, asset, day);
    if (p == null) return null;
    altsUsd += qty * p;
  }
  const usdt = b[USDT];
  const btcQty = b[BTC];
  const totalUsd = altsUsd + usdt + btcQty * btcPrice;
  return { day, btcPrice, altsUsd, usdt, btcQty, totalUsd, totalBtc: totalUsd / btcPrice };
}

/** One point per day from the buy-in to `until`, skipping days that can't be priced. */
export function valueSeries(entry: Entry, trades: Trade[], prices: PriceBook, until: Day): ValuePoint[] {
  if (until < entry.startedOn) return [];
  return eachDay(entry.startedOn, until)
    .map((d) => valueOn(entry, trades, prices, d))
    .filter((p): p is ValuePoint => p !== null);
}

/** BTC out per BTC in: 1.18 means the entry has 18% more BTC than it started with. */
export function multiple(entry: Entry, point: ValuePoint): number {
  return point.totalBtc / entry.btcIn;
}
