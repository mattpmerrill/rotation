import { RULES } from "./rules";
import { BTC, USDT, type Balances, type Day, type Entry, type Phase, type Trade } from "./types";

/** What an entry holds at the end of `day` (default: after every trade). It opens with
 *  `btcIn` BTC; each trade moves the asset and its USDT leg, fees coming out of USDT. */
export function balancesOn(entry: Entry, trades: Trade[], day?: Day): Balances {
  const b: Balances = { [BTC]: entry.btcIn, [USDT]: 0 };
  for (const t of trades) {
    if (day && t.tradedOn > day) continue;
    const sign = t.side === "buy" ? 1 : -1;
    b[t.asset] = (b[t.asset] ?? 0) + sign * t.qty;
    b[USDT] += -sign * t.qty * t.priceUsd - t.feeUsd;
  }
  return b;
}

/** The alts an entry still holds (non-dust), by asset. */
export function altHoldings(b: Balances): Record<string, number> {
  return Object.fromEntries(Object.entries(b).filter(([a, q]) => a !== BTC && a !== USDT && q > RULES.dust.coin));
}

/** Holding alts until they're all sold; then holding USDT until it's all back in BTC. */
export function phaseOf(b: Balances, trades: Trade[]): Phase {
  if (Object.keys(altHoldings(b)).length > 0) return "holding_alts";
  const rebought = trades.some((t) => t.asset === BTC && t.side === "buy");
  return rebought && b[USDT] < RULES.dust.usdt ? "back_in_btc" : "holding_usdt";
}
