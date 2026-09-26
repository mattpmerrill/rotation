import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { supabaseServer } from "./supabase/server";

export interface Viewer {
  id: string;
  email: string;
  name: string;
  isMember: boolean;
}

/** The signed-in person (verified from the JWT), or null. Cached for the request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("display_name, is_member")
    .eq("id", claims.sub)
    .maybeSingle();
  const email = (claims.email as string | undefined) ?? "";
  return {
    id: claims.sub,
    email,
    name: profile?.display_name ?? email.split("@")[0],
    isMember: profile?.is_member ?? false,
  };
});

/** The signed-in person, or a redirect to sign in. Call at the top of every private page and
 *  every Server Action: actions are reachable by direct POST, not only through the UI. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** A challenge member, or an error (pages show non-members a friendlier screen first). */
export async function requireMember(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isMember) throw new Error("Only challenge members can do that.");
  return viewer;
}
