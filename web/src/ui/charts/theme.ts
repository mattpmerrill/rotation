/** Shared chart styling: series colors (validated for the dark surface) and axis defaults. */
export const SERIES = {
  alts: "var(--series-alts)",
  usdt: "var(--series-usdt)",
  btc: "var(--series-btc)",
  line: "var(--btc)",
} as const;

export const AXIS = {
  stroke: "var(--line)",
  tick: { fill: "var(--ink-3)", fontSize: 12 },
  tickLine: false,
} as const;

export const GRID = { stroke: "var(--line)", strokeDasharray: "2 4", vertical: false } as const;
