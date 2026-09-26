/** Number formatting for people: BTC to 4 places, USD in whole dollars, changes as percents. */

export function formatBtc(x: number, places = 4): string {
  return `${x.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places })} BTC`;
}

export function formatUsd(x: number, opts: { cents?: boolean } = {}): string {
  const digits = opts.cents || Math.abs(x) < 10 ? 2 : 0;
  return x.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** A price in USD with enough precision for cheap coins ($0.000012). */
export function formatPrice(x: number): string {
  if (x >= 1) return formatUsd(x, { cents: true });
  return `$${x.toPrecision(4)}`;
}

/** 0.18 -> "+18%", -0.052 -> "−5.2%" (true minus sign). */
export function formatChange(x: number): string {
  const pct = x * 100;
  const digits = Math.abs(pct) < 10 ? 1 : 0;
  const s = Math.abs(pct).toFixed(digits);
  if (Number(s) === 0) return "0%";
  return `${pct >= 0 ? "+" : "−"}${s}%`;
}

export function formatMultiple(x: number): string {
  return `${x.toFixed(2)}×`;
}

export function formatQty(x: number): string {
  return x.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}

export function formatDay(day: string, opts: { year?: boolean } = { year: true }): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatMonth(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
