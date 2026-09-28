/**
 * The one shape every use case returns (contracts-and-errors.md). Expected failures are data, not
 * exceptions: the caller branches on a stable `code`, and shows `message`, which is written for a
 * person and may change. Unexpected failures are thrown (or logged and reported as "unexpected").
 */
export type ApplicationErrorCode =
  | "invalid_input" //   the request was malformed or failed validation
  | "forbidden" //       the caller may not do this
  | "not_found" //       what they asked about isn't there
  | "conflict" //        it already exists, or changed underneath them
  | "rule_violation" //  it breaks a challenge rule
  | "unavailable" //     a dependency is down; try again
  | "unexpected"; //     a bug or a failure we did not anticipate

export interface ApplicationError {
  code: ApplicationErrorCode;
  message: string;
  /** Per-field messages for a form, keyed by field name. */
  fieldErrors?: Record<string, string[]> | undefined;
}

export type ApplicationResult<T> = { ok: true; data: T } | { ok: false; error: ApplicationError };

export function ok<T>(data: T): ApplicationResult<T> {
  return { ok: true, data };
}

export function fail(
  code: ApplicationErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ApplicationResult<never> {
  return { ok: false, error: { code, message, fieldErrors } };
}
