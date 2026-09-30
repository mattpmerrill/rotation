import "server-only";
import { redirect } from "next/navigation";
import type { Viewer } from "@/domain/viewer";
import { getViewer } from "./viewer.repository";

/**
 * The access checks every private page and Server Action starts with. They live here, below the
 * features, because every feature's actions need them and features may not import each other;
 * pages reach them through `features/auth/viewer`. The proxy is not the authorization boundary,
 * and the database checks again.
 */

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

/** An admin, or an error. Server Actions for admin work start with this: they are reachable by
 *  direct POST, and the database functions check again. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) throw new Error("Only an admin can do that.");
  return viewer;
}
