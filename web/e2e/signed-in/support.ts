import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Helpers for the signed-in journey. It needs a real Supabase to sign in to: the local stack
 * (`supabase start`), with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
 * `SUPABASE_SECRET_KEY` set from `supabase status -o env`, and the app built with the same values.
 * The secret key is used only here, to set up an admin and to read the audit trail: the people in the
 * test itself sign up and are approved through the app, as your friends would be.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

export const admin = () => createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

/** Run SQL as the database owner in the local Supabase container. Admin status is deliberately not
 *  settable through the API (not even with the secret key), so setting up an admin needs SQL: the same
 *  one-off statement that makes the owner an admin in production. */
function sql(statement: string): void {
  execFileSync(
    "docker",
    ["exec", "supabase_db_rotation", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement],
    {
      stdio: "pipe",
    },
  );
}

/** A person who is already an admin and a member, as the owner is in production. */
export async function createAdmin(email: string, password: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`could not create the admin: ${error?.message}`);
  sql(
    `update public.profiles set is_admin = true, is_member = true, display_name = 'Matt' where id = '${data.user.id}'`,
  );
  return data.user.id;
}

/** A browser session of its own, so two people can be signed in at once. */
export async function newPerson(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

export async function signInWithEmail(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function createAccountWithEmail(page: Page, name: string, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}

/** The app's own error or status message. Next.js keeps a separate, empty role="alert" element for
 *  announcing route changes, so `getByRole("alert")` alone matches two elements. */
export const notice = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** A unique email so a re-run against the same database never collides. */
export const uniqueEmail = (who: string) => `${who}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
