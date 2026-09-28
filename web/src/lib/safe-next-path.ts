/** A same-site path to redirect to after sign-in, or `fallback`. Never another origin: a `next`
 *  parameter that is a full URL, or starts with `//` (protocol-relative) or `/\\`, would otherwise turn
 *  the sign-in page into an open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
