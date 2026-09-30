import "server-only";
import { ok, type ApplicationResult } from "@/lib/result";
import { authFailure } from "./failure";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Auth operations that need the secret key. The caller must already have checked that the person
 * asking is an admin and recorded the action (a user-initiated operation with the
 * elevated key has explicit application authorization and is audit-logged).
 */

/** A one-time sign-in token for `email`, without sending any email. The admin passes it to the
 *  person as a link to /auth/confirm; it works once and expires (Auth's OTP lifetime, an hour). */
export async function createRecoveryToken(email: string): Promise<ApplicationResult<{ tokenHash: string }>> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email });
  if (error) return authFailure("auth.admin.recovery_link", error);
  return ok({ tokenHash: data.properties.hashed_token });
}
