import "server-only";
import { createRecoveryToken } from "@/data/auth-admin.repository";
import { listPeople, recordHelpLink, rejectSignup, setMember } from "@/data/people.repository";
import { fail, ok, type ApplicationResult } from "@/lib/result";

/**
 * The admin's use cases (architecture.md: the service is the use case): approve someone, take a
 * membership away, reject a sign-up, and make a one-time sign-in help link. The Server Action has
 * already checked that the caller is an admin, and the database functions check it again.
 */

/** Approve someone who signed up. */
export async function approvePerson(personId: string): Promise<ApplicationResult<null>> {
  return setMember(personId, true);
}

/** Take someone's membership away. Their basket, if they have one, is kept. */
export async function removeMembership(personId: string): Promise<ApplicationResult<null>> {
  return setMember(personId, false);
}

/** Reject a sign-up: delete an account that hasn't been approved. */
export async function rejectPerson(personId: string): Promise<ApplicationResult<null>> {
  return rejectSignup(personId);
}

/**
 * A one-time link that signs a person in and lets them choose a new password, for a friend who
 * forgot theirs (there are no password-reset emails while there is no email service). The admin
 * passes it on privately. It works once and expires within an hour, an admin cannot make one for
 * another admin, and the action is recorded before the link is made, so a link never exists
 * without a trace.
 */
export async function createHelpLink(personId: string, origin: string): Promise<ApplicationResult<{ url: string }>> {
  const people = await listPeople();
  if (!people.ok) return people;
  const person = people.data.find((p) => p.id === personId);
  if (!person) return fail("not_found", "That person wasn't found.");
  if (person.isAdmin) return fail("forbidden", "Admins can't make a help link for another admin.");

  const recorded = await recordHelpLink(person.id);
  if (!recorded.ok) return recorded;
  const token = await createRecoveryToken(person.email);
  if (!token.ok) return token;
  return ok({ url: `${origin}/auth/confirm?token_hash=${encodeURIComponent(token.data.tokenHash)}&type=recovery` });
}
