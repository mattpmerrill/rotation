import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { env } from "../env";

/** Supabase with the secret key: bypasses RLS. Only the scheduled job uses it. */
export function supabaseAdmin() {
  const e = env();
  if (!e.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
