import "server-only";
import { env } from "./env";

/** Live USD prices from CoinGecko, and when they were fetched. */
export interface LivePrices {
  prices: Record<string, number>;
  /** Epoch ms of the newest quote. */
  at: number;
}

const LIVE_SECONDS = 60;

/**
 * Current prices for `ids`, shared across requests for a minute so the whole group refreshing
 * costs one CoinGecko call a minute. Null if CoinGecko is slow or down: the app then falls back
 * to the daily closes, so a hiccup never breaks a page.
 */
export async function getLivePrices(ids: string[]): Promise<LivePrices | null> {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return null;
  const key = env().COINGECKO_API_KEY;
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", unique.join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_last_updated_at", "true");
  try {
    const res = await fetch(url, {
      headers: key ? { "x-cg-demo-api-key": key } : {},
      next: { revalidate: LIVE_SECONDS, tags: ["live-prices"] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usd?: number; last_updated_at?: number }>;
    const prices: Record<string, number> = {};
    let at = 0;
    for (const [id, q] of Object.entries(body)) {
      if (typeof q.usd !== "number" || !(q.usd > 0)) continue;
      prices[id] = q.usd;
      at = Math.max(at, (q.last_updated_at ?? 0) * 1000);
    }
    return Object.keys(prices).length ? { prices, at: at || Date.now() } : null;
  } catch {
    return null;
  }
}
