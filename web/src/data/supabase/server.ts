import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { env } from "../env";

/** Supabase as the signed-in person (RLS applies), for Server Components, Actions and Routes. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  const e = env();
  return createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which can't set cookies: the proxy refreshes sessions.
        }
      },
    },
  });
}

/** Any Supabase client for this schema: the signed-in one, or the job's secret-key one. */
export type Db = SupabaseClient<Database>;
