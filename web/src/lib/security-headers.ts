/**
 * The response headers that harden every page (the security standard: CSP and the usual headers). Plain
 * strings and a pure builder, so next.config.ts can import them and a test can read them.
 *
 * Two kinds: the static ones (`staticSecurityHeaders`) go on every response from next.config.ts;
 * the Content-Security-Policy carries a fresh nonce per request, so the proxy builds it.
 */

/** CoinGecko's image CDNs: where `coins.image_url` points. The icons are plain <img> elements, so
 *  both the CSP (img-src) and next.config.ts (images.remotePatterns) name them. */
export const COIN_IMAGE_HOSTS = ["coin-images.coingecko.com", "assets.coingecko.com"] as const;

/** Sign-in with Google: the form posts to us, and the redirect chain passes through these origins.
 *  form-action covers redirects after a form post, so they must be allowed there. */
const GOOGLE_SIGN_IN = "https://accounts.google.com";

export const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors in the CSP is the modern form; this is the same rule for old browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
] as const;

/** A fresh, unguessable value for one request's Content-Security-Policy. */
export const newNonce = (): string => btoa(crypto.randomUUID());

export interface ContentSecurityPolicyOptions {
  /** A fresh, unguessable value for this request. Next.js reads it from the policy and puts it on
   *  the scripts and styles it renders. */
  nonce: string;
  /** The Supabase project URL: auth redirects go through it. */
  supabaseUrl: string;
  /** `next dev` needs eval (React's debugging) and inline styles (hot reload). Never in production. */
  development?: boolean;
}

/**
 * The page policy. Scripts run only with this request's nonce (and what such a script loads,
 * `strict-dynamic`); nothing can frame the app or change its base URL; forms post only to us and
 * to the sign-in redirect chain. Inline style *attributes* (React `style` props, Recharts) are
 * allowed, because a nonce cannot be put on an attribute; inline style *elements* need the nonce.
 */
export function buildContentSecurityPolicy({
  nonce,
  supabaseUrl,
  development = false,
}: ContentSecurityPolicyOptions): string {
  const supabase = new URL(supabaseUrl).origin;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${COIN_IMAGE_HOSTS.map((h) => `https://${h}`).join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    `form-action 'self' ${supabase} ${GOOGLE_SIGN_IN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}
