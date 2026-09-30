import type { NextConfig } from "next";
import { COIN_IMAGE_HOSTS, staticSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Do not announce the framework in every response.
  poweredByHeader: false,
  images: {
    // Coin icons come from CoinGecko's CDN. They're shown unoptimized: they're already small, and
    // it keeps them off the image-optimization quota. The hosts are shared with the CSP's img-src.
    remotePatterns: COIN_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  async headers() {
    // The Content-Security-Policy is not here: it carries a per-request nonce, so src/proxy.ts sets it.
    return [{ source: "/:path*", headers: [...staticSecurityHeaders] }];
  },
};

export default nextConfig;
