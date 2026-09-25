import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sign-in and email confirmation links both land here with a one-time code.
// If the provider or Supabase failed, they send error_description instead: pass it on.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/plan";
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));

  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(`Sign-in failed: ${providerError.replace(/\+/g, " ")}`);
  if (!code) return fail("link");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(`Sign-in failed: ${error.message}`);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
