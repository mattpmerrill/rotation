/**
 * The messages the sign-in page can show for a failed sign-in, keyed by a short code carried in the
 * URL (`/login?error=expired`). The page shows only these fixed texts. It never shows text taken
 * from the URL: a link like `/login?error=<anything>` would otherwise let anyone put their own
 * words in front of a signed-out visitor.
 */
export const LOGIN_ERRORS = {
  expired: "That sign-in link has expired or was already used. Sign in again.",
  denied: "Sign-in was cancelled. Try again whenever you're ready.",
  failed: "Sign-in didn't work. Try again.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

/** The fixed message for a code from the URL, or undefined for anything that isn't one of ours. */
export function loginErrorMessage(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code as LoginErrorCode] : undefined;
}
