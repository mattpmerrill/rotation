import rules from "./cycle-rules.json";
import coinList from "./coins.json";

export const RULES = rules;
export const COINS = coinList.coins as { id: string; symbol: string; name: string; rank: number }[];
export const COINS_AS_OF = coinList.as_of as string;
export const coinById = new Map(COINS.map((c) => [c.id, c]));

export type CycleState = {
  day: string;
  btc_price: number;
  ath: number;
  ath_date: string;
  drawdown: number;
  days_since_ath: number;
  mvrv: number | null;
  last_halving: string;
  days_since_halving: number;
  next_halving_est: string;
  phase: string;
  upcoming: { date: string; what: string }[];
};

const DAY = 86_400_000;
export const addDays = (iso: string, d: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + d * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

export type Milestone = { date: string; label: string; kind: "alt" | "sell" | "buy" | "halving"; estimated: boolean };

/** Every dated step of a cycle that starts at `halving`, from config/rules.yaml. */
export function cycleMilestones(halving: string, estimated: boolean): Milestone[] {
  const [w0, w1] = RULES.sell_window;
  const n = RULES.sell_tranches;
  const sellDays = Array.from({ length: n }, (_, i) => w0 + Math.round((i * (w1 - w0)) / n));
  return [
    { date: halving, label: "Halving", kind: "halving", estimated },
    ...RULES.alt_slice_days.map((d, i) => ({
      date: addDays(halving, d),
      label: `Alt buy, slice ${i + 1} of ${RULES.alt_slice_days.length}`,
      kind: "alt" as const,
      estimated,
    })),
    ...sellDays.map((d, i) => ({
      date: addDays(halving, d),
      label: `Sell window, tranche ${i + 1} of ${n}: ${Math.round(RULES.sell_btc_frac * 100)}% of BTC and all alts over the window`,
      kind: "sell" as const,
      estimated,
    })),
  ];
}

export const btc = (x: number, d = 4) => `${x.toFixed(d)} BTC`;
export const usd = (x: number) =>
  x.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const niceDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
