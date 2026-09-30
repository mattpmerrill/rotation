/**
 * The one shape every use case returns (the contracts-and-errors standard). Expected failures are data, not
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

/** The `fieldErrors` key for messages that belong to the whole form, not one field. */
export const FORM = "form";

/** Every message a failure should show under a form: its form-level list if it has one (a rule
 *  check can find several problems at once), otherwise the single message. */
export function formMessages(error: ApplicationError): string[] {
  const listed = error.fieldErrors?.[FORM];
  return listed && listed.length > 0 ? listed : [error.message];
}

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
