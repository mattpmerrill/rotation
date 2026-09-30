# integrations

One adapter per outside vendor: `coingecko/` (live prices) and `discord/` (the group's webhook). An adapter owns everything about talking to its vendor: the URL, a timeout on every call, schema validation of what comes back, and the translation into domain types, so a vendor's shapes never leave the folder. A failure is logged and reported to the caller, never turned into a half-valid value.

May import: `domain` and `lib`. Only `features` import from here (ESLint and dependency-cruiser both enforce it). An adapter does not read the environment: its caller passes the key or URL in, which keeps it testable with a scripted `fetch`.

Example, `coingecko/live-prices.ts`: `getLivePrices(ids, { apiKey })` calls CoinGecko with a 4 second timeout, parses the response with Zod (a malformed quote is skipped, a malformed body gives `null`), and returns the domain's `LivePrices`. The app then falls back to the daily closes, so a hiccup never breaks a page.

Market data for the daily job (CoinGecko, CoinMetrics) is fetched by the Python engine, not here.
