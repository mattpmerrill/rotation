import "server-only";
import { ok, type ApplicationResult } from "@/lib/result";
import { authFailure } from "./failure";
import { supabaseServer } from "./supabase/server";

/**
 * The repository for Supabase Auth: sign-in, sign-up, sign-out, and the one-time links. Every call
 * returns an ApplicationResult, with Auth's failures translated by authFailure so none of its own
 * text reaches a user (and a duplicate account is reported as "conflict" for the service to
 * handle without revealing which emails have accounts).
 */

export async function signInWithPassword(email: string, password: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  return error ? authFailure("auth.sign_in", error) : ok(null);
}

/** Create an account. `signedIn` is true when Auth signs the person in straight away (email
 *  confirmation off), false when they must confirm their email first. `name` becomes their
 *  profile's display name (the sign-up trigger reads `full_name`). */
export async function signUp(
  email: string,
  password: string,
  name: string,
  confirmUrl: string,
): Promise<ApplicationResult<{ signedIn: boolean }>> {
  const db = await supabaseServer();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmUrl, data: { full_name: name } },
  });
  if (error) return authFailure("auth.sign_up", error);
  return ok({ signedIn: data.session !== null });
}

/** The Google consent URL to send the browser to. */
export async function googleSignInUrl(redirectTo: string): Promise<ApplicationResult<{ url: string }>> {
  const db = await supabaseServer();
  const { data, error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) return authFailure("auth.google_url", error);
  return ok({ url: data.url });
}

/** Finish a Google or email-link sign-in with the one-time code it came back with. */
export async function exchangeCode(code: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.auth.exchangeCodeForSession(code);
  return error ? authFailure("auth.exchange_code", error) : ok(null);
}

/** Finish a sign-in help link: verify its one-time token and start the session it belongs to. */
export async function verifyRecoveryToken(tokenHash: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  return error ? authFailure("auth.verify_recovery", error) : ok(null);
}

/** Set a new password for the signed-in person. */
export async function updatePassword(password: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.auth.updateUser({ password });
  return error ? authFailure("auth.update_password", error) : ok(null);
}

export async function signOut(): Promise<void> {
  const db = await supabaseServer();
  await db.auth.signOut();
}
