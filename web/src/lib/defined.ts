/** `value`, or an error naming what was missing. For places where the code guarantees a value
 *  exists but the type system can't see it (an indexed read, a lookup). Prefer handling the
 *  missing case; use this only when its absence would be a bug. */
export function defined<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be defined`);
  return value;
}
