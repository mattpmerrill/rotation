"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import * as auth from "@/data/auth";
import { requestOrigin } from "./origin";

export interface AuthFormState {
  error?: string;
  sent?: boolean;
}

const credentials = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(10, "Use a password of at least 10 characters."),
});

function parse(form: FormData) {
  return credentials.safeParse({ email: form.get("email"), password: form.get("password") });
}

export async function signIn(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = parse(form);
  if (!input.success) return { error: input.error.issues[0].message };
  const error = await auth.signInWithPassword(input.data.email, input.data.password);
  if (error)
    return {
      error:
        error === "Email not confirmed" ? "Confirm your email first: check your inbox." : "Wrong email or password.",
    };
  redirect("/");
}

export async function signUp(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = parse(form);
  if (!input.success) return { error: input.error.issues[0].message };
  const error = await auth.signUp(input.data.email, input.data.password, `${await requestOrigin()}/auth/callback`);
  return error ? { error } : { sent: true };
}

export async function signInWithGoogle(): Promise<void> {
  const url = await auth.googleSignInUrl(`${await requestOrigin()}/auth/callback`);
  if (!url) redirect(`/login?error=${encodeURIComponent("Google sign-in isn't available. Use email.")}`);
  redirect(url);
}

export async function signOut(): Promise<void> {
  await auth.signOut();
  redirect("/login");
}
