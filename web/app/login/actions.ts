"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

const back = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}`);

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) back(error.message === "Email not confirmed" ? "Confirm your email first: check your inbox." : "Wrong email or password.");
  redirect("/plan");
}

export async function signUp(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) back("Use a password of at least 10 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? ""),
    password,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=/plan` },
  });
  if (error) back(error.message);
  redirect("/login?sent=1");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=/plan` },
  });
  if (error || !data.url) back("Google sign-in isn't available yet. Use email for now.");
  redirect(data.url!);
}
