import "server-only";
import type { Person } from "@/domain/people";
import { ok, type ApplicationResult } from "@/lib/result";
import { dbFailure } from "./failure";
import { supabaseServer } from "./supabase/server";

/**
 * The admin's view of who has signed up, through the database's admin-only functions (migration
 * signup_approval, ADR-006). Each function checks that the caller is an admin, so calling these
 * as anyone else fails with "forbidden". Reads throw on failure; writes return an ApplicationResult.
 */

/** Everyone who has signed up, with email and approval state. */
export async function listPeople(): Promise<ApplicationResult<Person[]>> {
  const db = await supabaseServer();
  const { data, error } = await db.rpc("admin_list_people");
  if (error) return dbFailure("people.list", error);
  return ok(
    data.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.display_name || r.email.split("@")[0] || "Player",
      isMember: r.is_member,
      isAdmin: r.is_admin,
      signedUpAt: r.created_at,
      provider: r.provider,
    })),
  );
}

/** Approve someone (true) or take their membership away (false). */
export async function setMember(userId: string, isMember: boolean): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("admin_set_member", { p_user_id: userId, p_is_member: isMember });
  return error ? dbFailure("people.set_member", error) : ok(null);
}

/** Delete an account that has not been approved. */
export async function rejectSignup(userId: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("admin_reject_signup", { p_user_id: userId });
  return error ? dbFailure("people.reject", error) : ok(null);
}

/** Put a sign-in help link in the audit trail. */
export async function recordHelpLink(userId: string): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("admin_record_help_link", { p_target: userId });
  return error ? dbFailure("people.help_link", error) : ok(null);
}
