/** A whole number from a URL segment such as `/entries/12`, or null when it is not one. The segment
 *  comes from outside the app, so a route treats null as "not found", not as an error. */
export function integerParam(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}
