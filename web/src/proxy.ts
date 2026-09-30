import type { NextRequest } from "next/server";
import { refreshSession } from "@/features/auth/session";
import { contentSecurityPolicy } from "@/features/security/content-security-policy";
import { newNonce } from "@/lib/security-headers";

/**
 * Two jobs on every page request: give it a Content-Security-Policy with a fresh nonce, and keep
 * the auth session fresh. Pages and actions check access themselves (features/auth/viewer).
 */
export async function proxy(request: NextRequest) {
  const policy = contentSecurityPolicy(newNonce());
  // Next.js reads the nonce from the request's policy and puts it on the scripts and styles it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = await refreshSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|data/|api/jobs/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)",
  ],
};
