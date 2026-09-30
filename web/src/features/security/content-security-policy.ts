import { env } from "@/data/env";
import { buildContentSecurityPolicy } from "@/lib/security-headers";

/** The Content-Security-Policy for one page request, with that request's nonce. The proxy sets it
 *  on the request (so Next.js puts the nonce on the scripts it renders) and on the response. */
export function contentSecurityPolicy(nonce: string): string {
  const { NEXT_PUBLIC_SUPABASE_URL, NODE_ENV } = env();
  return buildContentSecurityPolicy({
    nonce,
    supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
    development: NODE_ENV === "development",
  });
}
