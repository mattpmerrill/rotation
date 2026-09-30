import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/data/database.types";
import { env } from "@/data/env";

/** Refreshes the auth cookie on every request (Supabase's documented proxy pattern). The response
 *  carries `requestHeaders` on to the page, which is how the proxy hands it the request's
 *  Content-Security-Policy. */
export async function refreshSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const e = env();
  const supabase = createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  // Nothing may run between createServerClient and getClaims: it refreshes the token.
  await supabase.auth.getClaims();
  return response;
}
