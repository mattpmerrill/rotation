import "server-only";
import { cache } from "react";
import type { Viewer } from "@/domain/viewer";
import { supabaseServer } from "./supabase/server";

/**
 * The repository for the signed-in person: their verified identity from the session, and their
 * `profiles` row (approval and admin flags), which the person cannot change through the API.
 */

/** The signed-in person (verified from the JWT), or null. Cached for the request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, is_member, is_admin")
    .eq("id", claims.sub)
    .maybeSingle();
  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: claims.sub,
    email,
    name: profile?.display_name ?? email.split("@")[0] ?? email,
    isMember: profile?.is_member ?? false,
    isAdmin: profile?.is_admin ?? false,
  };
});
