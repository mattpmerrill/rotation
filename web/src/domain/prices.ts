import type { Day, PriceBook } from "./types";

/** Live USD prices for some assets, and when the newest quote was made. */
export interface LivePrices {
  prices: Record<string, number>;
  /** Epoch ms of the newest quote. */
  at: number;
}

/** The close on `day`, or the last one before it if that day has no price. Null if the asset
 *  has no price on or before `day`. */
export function priceOn(book: PriceBook, asset: string, day: Day): number | null {
  const s = book[asset];
  const first = s?.dates[0];
  if (!s || first === undefined || first > day) return null;
  // binary search for the last date <= day
  let lo = 0;
  let hi = s.dates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((s.dates[mid] ?? "") <= day) lo = mid;
    else hi = mid - 1;
  }
  return s.closes[lo] ?? null;
}

/** `book` with `live` prices as the close for `today`: replaces today's close if the daily job
 *  already wrote one, appends it otherwise. Days after `today` are never touched. Pure. */
export function withLivePrices(book: PriceBook, live: Record<string, number>, today: Day): PriceBook {
  const out: PriceBook = { ...book };
  for (const [asset, price] of Object.entries(live)) {
    const s = book[asset];
    const last = s?.dates.at(-1);
    if (!s || last === undefined) {
      out[asset] = { dates: [today], closes: [price] };
      continue;
    }
    if (last > today) continue;
    out[asset] =
      last === today
        ? { dates: s.dates, closes: [...s.closes.slice(0, -1), price] }
        : { dates: [...s.dates, today], closes: [...s.closes, price] };
  }
  return out;
}

/** The latest day any of `assets` has a price for. Null if none do. */
export function latestPriceDay(book: PriceBook, assets: string[]): Day | null {
  let latest: Day | null = null;
  for (const a of assets) {
    const d = book[a]?.dates.at(-1);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}
