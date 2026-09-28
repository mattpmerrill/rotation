/** The first validation message from a failed zod parse, for showing under a form. */
export function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
