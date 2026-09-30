// Preloaded into the app server by scripts/screenshots.mjs: refuses calls to CoinGecko so the
// app serves the seeded daily closes, the same on every run.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).hostname === "api.coingecko.com") return Promise.reject(new TypeError("offline for screenshots"));
  return realFetch(input, init);
};
