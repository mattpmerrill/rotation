import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/data/auth";
import { safeNextPath } from "./origin";

/** Google sign-in and email confirmation links land here with a one-time code. If the provider
 *  failed, it sends error_description instead: show it. */
export async function completeSignIn(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(`Sign-in failed: ${providerError.replace(/\+/g, " ")}`);
  const code = url.searchParams.get("code");
  if (!code) return fail("That sign-in link has expired or was already used. Sign in again.");

  const error = await exchangeCode(code);
  if (error) return fail(`Sign-in failed: ${error}`);
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
