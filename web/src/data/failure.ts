import { logEvent } from "@/lib/log";
import { fail, type ApplicationResult } from "@/lib/result";

/** What the database client reports when a query or function fails. `code` is a Postgres SQLSTATE
 *  for database errors (PostgREST's own errors use codes that start with "PGRST"). */
export interface DbError {
  code?: string | undefined;
  message: string;
}

/**
 * Translate a database failure into the app's own result, so no raw database text reaches a user
 * (the contracts-and-errors standard). The database functions raise these SQLSTATEs on purpose (see
 * supabase/migrations): 42501 not allowed, 23514 a challenge rule, 23505 already exists, P0002 not
 * found. Everything else is unexpected: the user gets a generic message and the details go to the log.
 *
 * The fixed messages here are deliberately generic. The friendly, specific messages come from the
 * domain checks that run before the database is asked (they mirror the same rules).
 */
export function dbFailure(event: string, error: DbError): ApplicationResult<never> {
  const sqlstate = error.code ?? null;
  switch (sqlstate) {
    case "42501":
      logEvent("warn", event, { failure: "forbidden", sqlstate, detail: error.message });
      return fail("forbidden", "You can't do that.");
    case "23514":
      logEvent("warn", event, { failure: "rule_violation", sqlstate, detail: error.message });
      return fail("rule_violation", "That doesn't fit the challenge rules. Check your amounts and dates.");
    case "23505":
      logEvent("warn", event, { failure: "conflict", sqlstate, detail: error.message });
      return fail("conflict", "That already exists.");
    case "P0002":
      logEvent("warn", event, { failure: "not_found", sqlstate, detail: error.message });
      return fail("not_found", "That wasn't found.");
    default:
      logEvent("error", event, { failure: "unexpected", sqlstate, detail: error.message });
      return fail("unexpected", "Something went wrong on our side. Try again in a moment.");
  }
}

/** What Supabase Auth reports when sign-in, sign-up or a link fails. `code` is Auth's own stable
 *  error code (for example "invalid_credentials"); `status` is the HTTP status. */
export interface AuthError {
  code?: string | undefined;
  status?: number | undefined;
  message: string;
}

/**
 * Translate a Supabase Auth failure into the app's own result. Auth's messages are written for
 * developers and some reveal whether an email has an account, so none of them reach a user: each
 * known code maps to a fixed message, and anything unknown is logged and shown as a generic one.
 * A duplicate account is returned as "conflict" so the caller can decide what to say about it.
 */
export function authFailure(event: string, error: AuthError): ApplicationResult<never> {
  const code = error.code ?? null;
  const expected = (failure: string, result: ApplicationResult<never>) => {
    logEvent("warn", event, { failure, authCode: code, status: error.status ?? null });
    return result;
  };
  switch (code) {
    case "invalid_credentials":
      return expected("forbidden", fail("forbidden", "Wrong email or password."));
    case "email_not_confirmed":
      return expected("forbidden", fail("forbidden", "Confirm your email first: check your inbox."));
    case "user_already_exists":
    case "email_exists":
      return expected("conflict", fail("conflict", "That email already has an account."));
    case "weak_password":
      return expected("invalid_input", fail("invalid_input", "Use a password of at least 10 characters."));
    case "same_password":
      return expected("rule_violation", fail("rule_violation", "Choose a different password from your current one."));
    case "signup_disabled":
      return expected("forbidden", fail("forbidden", "Sign-ups are closed right now."));
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return expected("unavailable", fail("unavailable", "Too many attempts. Wait a few minutes and try again."));
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return expected("not_found", fail("not_found", "That link has expired or was already used."));
    default:
      logEvent("error", event, {
        failure: "unexpected",
        authCode: code,
        status: error.status ?? null,
        detail: error.message,
      });
      return fail("unexpected", "Something went wrong on our side. Try again in a moment.");
  }
}
