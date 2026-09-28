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
 * (contracts-and-errors.md). The database functions raise these SQLSTATEs on purpose (see
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
