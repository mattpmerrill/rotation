"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/data/guards";
import { firstIssue } from "@/lib/first-issue";
import { requestOrigin } from "@/data/origin";
import {
  changePassword,
  createAccount,
  signIn as signInUseCase,
  signOut as signOutUseCase,
  startGoogleSignIn,
} from "./service";

/**
 * Transport for the sign-in use cases: validate the form, call one service, turn
 * its result into what the form shows, and redirect on success. These are the entry points a
 * signed-out visitor can reach, so all input is treated as untrusted and Auth's own text is never
 * shown (the repository translates it).
 */
export interface AuthFormState {
  error?: string;
  sent?: boolean;
}

const email = z.email("Enter a valid email.");
const password = z.string().min(10, "Use a password of at least 10 characters.");
const credentials = z.object({ email, password });
const signUpInput = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60, "Use a shorter name."),
  email,
  password,
});
const newPassword = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

const adminUrl = async () => `${await requestOrigin()}/admin`;

export async function signIn(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: firstIssue(input.error) };
  const result = await signInUseCase(input.data.email, input.data.password, await adminUrl());
  if (!result.ok) return { error: result.error.message };
  redirect("/");
}

export async function signUp(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = signUpInput.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!input.success) return { error: firstIssue(input.error) };
  const origin = await requestOrigin();
  const result = await createAccount(input.data, `${origin}/auth/callback`, `${origin}/admin`);
  if (!result.ok) return { error: result.error.message };
  if (result.data.signedIn) redirect("/");
  return { sent: true };
}

export async function signInWithGoogle(): Promise<void> {
  const result = await startGoogleSignIn(`${await requestOrigin()}/auth/callback`);
  if (!result.ok) redirect("/login?error=failed");
  redirect(result.data.url);
}

/** Choose a new password after following a sign-in help link. */
export async function setNewPassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  await requireViewer();
  const input = newPassword.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!input.success) return { error: firstIssue(input.error) };
  const result = await changePassword(input.data.password);
  if (!result.ok) return { error: result.error.message };
  redirect("/");
}

export async function signOut(): Promise<void> {
  await signOutUseCase();
  redirect("/login");
}
