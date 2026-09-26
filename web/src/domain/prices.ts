import type { Day, PriceBook } from "./types";

/** The close on `day`, or the last one before it if that day has no price. Null if the asset
 *  has no price on or before `day`. */
export function priceOn(book: PriceBook, asset: string, day: Day): number | null {
  const s = book[asset];
  if (!s || s.dates.length === 0 || s.dates[0] > day) return null;
  // binary search for the last date <= day
  let lo = 0;
  let hi = s.dates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.dates[mid] <= day) lo = mid;
    else hi = mid - 1;
  }
  return s.closes[lo];
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
