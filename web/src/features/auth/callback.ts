import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/log";
import { completeSignIn, confirmHelpLink } from "./service";
import { safeNextPath } from "@/lib/safe-next-path";
import type { LoginErrorCode } from "./login-errors";

const toLogin = (origin: string, error: LoginErrorCode) =>
  NextResponse.redirect(new URL(`/login?error=${error}`, origin));

/**
 * Google sign-in and email links land here with a one-time code. If the provider sent an error
 * instead, its text is logged but not shown: the sign-in page shows a fixed message for a short
 * code (login-errors.ts), never text taken from the URL.
 */
export async function completeSignInFromRequest(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    logEvent("warn", "auth.callback_provider_error", { detail: providerError.slice(0, 200) });
    return toLogin(url.origin, "denied");
  }
  const code = url.searchParams.get("code");
  if (!code) return toLogin(url.origin, "expired");

  const result = await completeSignIn(code, new URL("/admin", url.origin).toString());
  if (!result.ok) return toLogin(url.origin, result.error.code === "not_found" ? "expired" : "failed");
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}

/** A sign-in help link from an admin: `/auth/confirm?token_hash=...&type=recovery`. It signs the
 *  person in and sends them to choose a new password. Any other type is refused. */
export async function confirmFromRequest(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  if (!tokenHash || url.searchParams.get("type") !== "recovery") return toLogin(url.origin, "expired");

  const result = await confirmHelpLink(tokenHash);
  if (!result.ok) return toLogin(url.origin, result.error.code === "not_found" ? "expired" : "failed");
  return NextResponse.redirect(new URL("/auth/reset", url.origin));
}
