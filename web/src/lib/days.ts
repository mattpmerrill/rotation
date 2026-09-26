/** Calendar-day helpers. Days are UTC dates as YYYY-MM-DD strings. */

const MS_PER_DAY = 86_400_000;

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fromTime(toTime(day) + n * MS_PER_DAY);
}

/** Whole days from `a` to `b` (negative if b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / MS_PER_DAY);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = toTime(from), end = toTime(to); t <= end; t += MS_PER_DAY) out.push(fromTime(t));
  return out;
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromTime(toTime(value)) === value;
}
