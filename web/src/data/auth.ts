import "server-only";
import { supabaseServer } from "./supabase/server";

/** Sign-in and sign-up against Supabase Auth. Returns an error message, or null on success. */

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

export async function signUp(email: string, password: string, confirmUrl: string): Promise<string | null> {
  const db = await supabaseServer();
  const { error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: confirmUrl } });
  return error?.message ?? null;
}

/** The Google consent URL to send the browser to. */
export async function googleSignInUrl(redirectTo: string): Promise<string | null> {
  const db = await supabaseServer();
  const { data, error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  return error ? null : data.url;
}

/** Finish a Google or email-link sign-in. */
export async function exchangeCode(code: string): Promise<string | null> {
  const db = await supabaseServer();
  const { error } = await db.auth.exchangeCodeForSession(code);
  return error?.message ?? null;
}

export async function signOut(): Promise<void> {
  const db = await supabaseServer();
  await db.auth.signOut();
}
