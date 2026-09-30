import { z } from "zod";
import type { LivePrices } from "@/domain/prices";
import { logEvent } from "@/lib/log";

const ENDPOINT = "https://api.coingecko.com/api/v3/simple/price";
const DEFAULTS = { timeoutMs: 4000, revalidateSeconds: 60 };

/** The response is `{ "<coin id>": { usd, last_updated_at } }`. A coin CoinGecko does not know is
 *  simply absent, and one malformed quote is skipped without discarding the others. */
const responseSchema = z.record(z.string(), z.unknown());
const quoteSchema = z.object({ usd: z.number().positive(), last_updated_at: z.number().optional() });

export interface LivePricesOptions {
  /** CoinGecko Demo key. Without it the keyless API is used, with lower limits. */
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Current USD prices for `ids`, shared across requests for a minute (Next's fetch cache) so the
 * whole group refreshing costs one CoinGecko call a minute. Null when CoinGecko is slow, down or
 * answers with something unexpected: the app then falls back to the daily closes, so a hiccup
 * never breaks a page. The failure is logged, never shown.
 *
 * The only place that knows CoinGecko's live price API exists; callers get the domain's
 * `LivePrices`.
 */
export async function getLivePrices(ids: string[], options: LivePricesOptions = {}): Promise<LivePrices | null> {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(ENDPOINT);
  url.searchParams.set("ids", unique.join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_last_updated_at", "true");
  try {
    const res = await fetchImpl(url, {
      headers: options.apiKey ? { "x-cg-demo-api-key": options.apiKey } : {},
      next: { revalidate: DEFAULTS.revalidateSeconds, tags: ["live-prices"] },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULTS.timeoutMs),
    });
    if (!res.ok) {
      logEvent("warn", "coingecko.live_prices_failed", { status: res.status });
      return null;
    }
    const body = responseSchema.parse(await res.json());
    const prices: Record<string, number> = {};
    let at = 0;
    for (const [id, raw] of Object.entries(body)) {
      const quote = quoteSchema.safeParse(raw);
      if (!quote.success) continue;
      prices[id] = quote.data.usd;
      at = Math.max(at, (quote.data.last_updated_at ?? 0) * 1000);
    }
    return Object.keys(prices).length ? { prices, at: at || Date.now() } : null;
  } catch (error) {
    logEvent("warn", "coingecko.live_prices_failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
