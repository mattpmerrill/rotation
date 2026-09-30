// Preloaded into the app server by scripts/screenshots.mjs. It answers the app's CoinGecko price
// calls itself, with the last daily closes in supabase/seed.sql, so the pages show their normal
// live-price state without a network and come out the same on every run.
import { readFileSync } from "node:fs";

const seedPath = process.env.SCREENSHOT_SEED_SQL;
/** The newest close per coin in the seed, from its `('coin', 'YYYY-MM-DD', close, ...` rows. */
const lastClose = new Map();
if (seedPath) {
  const newest = new Map();
  for (const [, coin, day, close] of readFileSync(seedPath, "utf8").matchAll(
    /^ {2}\('([^']+)', '(\d{4}-\d{2}-\d{2})', ([0-9.e+-]+),/gm,
  )) {
    if ((newest.get(coin) ?? "") <= day) {
      newest.set(coin, day);
      lastClose.set(coin, Number(close));
    }
  }
}

/** The body CoinGecko's /simple/price returns for the requested ids we have a close for. */
function simplePrice(url) {
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  // An hour ahead, so the page always reads "just now" however long the run takes.
  const quotedAt = Math.floor(Date.now() / 1000) + 3600;
  const body = {};
  for (const id of ids) {
    const usd = lastClose.get(id);
    if (usd !== undefined) body[id] = { usd, last_updated_at: quotedAt };
  }
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.coingecko.com") {
    if (url.pathname === "/api/v3/simple/price") return Promise.resolve(simplePrice(url));
    return Promise.reject(new TypeError("offline for screenshots"));
  }
  return realFetch(input, init);
};
