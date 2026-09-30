import "server-only";
import * as auth from "@/data/auth.repository";
import { announceOnce } from "./announce";
import { getViewer } from "@/data/viewer.repository";
import { waitingMessage } from "@/domain/people";
import { fail, ok, type ApplicationResult } from "@/lib/result";

/**
 * The sign-in use cases (architecture.md: the service is the use case). Input arrives already
 * validated by the Server Action. Auth's failures come back from the repository as typed results
 * with fixed messages, so nothing here shows Auth's own text.
 *
 * Every successful way in ends by checking whether the person is still waiting for approval, and if
 * so tells the admin once (announceOnce dedupes by person). That way it does not matter whether
 * they came by Google, by email, or by a link, or whether Discord was set up when they first signed up.
 */

const NEUTRAL_DUPLICATE = "We couldn't create that account. If you already have one, sign in instead.";

/** Tell the admin, once, that the signed-in person is waiting for approval. Best effort. */
async function announceIfWaiting(adminUrl: string): Promise<void> {
  const viewer = await getViewer();
  if (viewer && !viewer.isMember) await announceOnce(`waiting:${viewer.id}`, waitingMessage(viewer.name, adminUrl));
}

export async function signIn(email: string, password: string, adminUrl: string): Promise<ApplicationResult<null>> {
  const result = await auth.signInWithPassword(email, password);
  if (result.ok) await announceIfWaiting(adminUrl);
  return result;
}

/**
 * Create an account. `signedIn` is true when the person is signed in straight away (email
 * confirmation is off), false when they must confirm their email first.
 *
 * An email that already has an account is not reported as such (that would tell a stranger which
 * emails are registered). If the password given also matches, the person simply is signed in: they
 * probably forgot they had signed up. Otherwise they get the same neutral message either way.
 */
export async function createAccount(
  input: { email: string; password: string; name: string },
  confirmUrl: string,
  adminUrl: string,
): Promise<ApplicationResult<{ signedIn: boolean }>> {
  const created = await auth.signUp(input.email, input.password, input.name, confirmUrl);
  if (created.ok) {
    if (created.data.signedIn) await announceIfWaiting(adminUrl);
    return created;
  }
  if (created.error.code !== "conflict") return created;

  const existing = await auth.signInWithPassword(input.email, input.password);
  if (!existing.ok) return fail("conflict", NEUTRAL_DUPLICATE);
  await announceIfWaiting(adminUrl);
  return ok({ signedIn: true });
}

export async function signOut(): Promise<void> {
  await auth.signOut();
}

/** The Google consent URL to send the browser to. */
export async function startGoogleSignIn(redirectTo: string): Promise<ApplicationResult<{ url: string }>> {
  return auth.googleSignInUrl(redirectTo);
}

/** Finish a Google or email-link sign-in with the one-time code it came back with. */
export async function completeSignIn(code: string, adminUrl: string): Promise<ApplicationResult<null>> {
  const result = await auth.exchangeCode(code);
  if (result.ok) await announceIfWaiting(adminUrl);
  return result;
}

/** Finish a sign-in help link: start the session the link's one-time token belongs to. */
export async function confirmHelpLink(tokenHash: string): Promise<ApplicationResult<null>> {
  return auth.verifyRecoveryToken(tokenHash);
}

/** Set a new password for the signed-in person. */
export async function changePassword(password: string): Promise<ApplicationResult<null>> {
  return auth.updatePassword(password);
}
