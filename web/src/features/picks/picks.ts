/**
 * Joi's top picks: baskets that did best from this point in the last two cycles, with why.
 *
 * How they were found (2026-09-26): every basket of 2-6 coins from 28 established coins that
 * are in today's top 100 and on iTrustCapital (about 500,000 baskets), scored by the old
 * sell-window result in both cycles together (geometric mean), then a spread of themes
 * chosen by hand. The numbers on the page are computed live from the same history the
 * picker uses, so they always agree with it. Keep the text free of numbers for that reason.
 */
export interface Pick {
  slug: string;
  title: string;
  /** CoinGecko ids. */
  basket: string[];
  accent: "gold" | "violet" | "blue" | "aqua" | "magenta";
  summary: string;
  why: string[];
}

export const PICKS: Pick[] = [
  {
    slug: "launch-pad",
    title: "The launch pad",
    basket: ["solana", "hyperliquid"],
    accent: "gold",
    summary: "The best pair in both cycles: the standout new chain of each bull run, bought as soon as it traded.",
    why: [
      "Solana started trading in 2020 and became the chain of the 2021 alt season. Hyperliquid started at the end of 2024 and was one of the few coins that beat BTC in the last cycle.",
      "Solana didn't exist on the 2018 buy day and Hyperliquid didn't exist on the 2022 one, so those shares waited in BTC until launch. Money sitting in BTC can't bleed against it, which is why the pair held up in the bear.",
      "The catch: both are big now. The next cycle's version of them may be a coin that doesn't exist yet.",
    ],
  },
  {
    slug: "chains-and-ai",
    title: "New chains and AI",
    basket: ["solana", "hyperliquid", "render-token"],
    accent: "violet",
    summary: "The launch pad plus Render, which rode both the 2021 alt season and the 2023-24 AI boom.",
    why: [
      "Render (a network for renting out GPU power) started trading in late 2020 and ran with the 2021 alt season.",
      "In the last cycle it was one of the few older alts to beat BTC, as GPU and AI coins rallied with the AI boom.",
      "A third coin spreads the bet: if one of the new chains had flopped, Render would still have carried the basket.",
    ],
  },
  {
    slug: "exchange-coin",
    title: "Add an exchange coin",
    basket: ["binancecoin", "solana", "hyperliquid", "render-token"],
    accent: "blue",
    summary: "Adds BNB, Binance's own coin: less upside, but the steadiest of the older alts.",
    why: [
      "BNB was already a top coin on the buy day, so it's the part of this basket that doesn't depend on catching a launch.",
      "It boomed in 2021 when Binance Smart Chain took off. In the last cycle it still lost against BTC, but less than Ethereum, Cardano or Chainlink.",
      "Four coins trade some of the top result for a basket that isn't riding on one or two coins.",
    ],
  },
  {
    slug: "real-world",
    title: "Real-world assets",
    basket: ["ripple", "solana", "hyperliquid", "ondo-finance", "render-token"],
    accent: "aqua",
    summary: "The five-coin basket that held up best in the last cycle.",
    why: [
      "Ondo tokenizes US Treasuries and other real-world assets, one of the big stories of 2024, and it started trading early that year.",
      "XRP's big rally at the end of 2024 left it close to even with BTC by the old sell window, better than most older alts.",
      "With five coins, no single coin decides the result. This is the most balanced of the picks.",
    ],
  },
  {
    slug: "old-guard",
    title: "The old guard",
    basket: ["ripple", "binancecoin", "solana", "dogecoin", "chainlink"],
    accent: "magenta",
    summary: "Joi's first pick: the big names. Shown for contrast: brilliant in an alt season, a loss without one.",
    why: [
      "In 2018-21 almost everything worked: Chainlink led the 2020 DeFi summer, Dogecoin had its 2021 mania, BNB boomed with Binance Smart Chain, and Solana launched.",
      "In 2022-25 there was no broad alt season. Only Solana beat BTC; the rest bled, and the basket finished below 1 BTC.",
      "This is the risk the challenge takes: established coins need an alt season to beat just holding BTC.",
    ],
  },
];
