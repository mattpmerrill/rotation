import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Coin icons come from CoinGecko's CDN (see data/prices.ts). They're shown unoptimized:
    // they're already small, and it keeps them off the image-optimization quota.
    remotePatterns: [
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
    ],
  },
};

export default nextConfig;
