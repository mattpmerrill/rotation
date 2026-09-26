import { RULES } from "./rules";
import { BTC, type Side } from "./types";

/** A trade before it's saved: the buy-in's BTC sale and its alt buys. */
export interface DraftTrade {
  asset: string;
  side: Side;
  qty: number;
  priceUsd: number;
  feeUsd: number;
}

export interface BuyInInput {
  btcIn: number;
  btcPriceUsd: number;
  /** USD price of each basket coin on the buy-in day. */
  coinPricesUsd: Record<string, number>;
  basket: string[];
  feeRate: number;
}

/**
 * The trades that swap `btcIn` BTC into the basket in equal dollar amounts: sell the BTC for
 * USDT (less the fee), then spend the USDT equally, each buy's fee included, so nothing is left.
 */
export function planBuyIn({ btcIn, btcPriceUsd, coinPricesUsd, basket, feeRate }: BuyInInput): DraftTrade[] {
  const gross = btcIn * btcPriceUsd;
  const sale: DraftTrade = { asset: BTC, side: "sell", qty: btcIn, priceUsd: btcPriceUsd, feeUsd: gross * feeRate };
  const perCoin = (gross - sale.feeUsd) / basket.length;
  const buys = basket.map((asset): DraftTrade => {
    const priceUsd = coinPricesUsd[asset];
    const cost = perCoin / (1 + feeRate); // cost + fee = perCoin
    return { asset, side: "buy", qty: cost / priceUsd, priceUsd, feeUsd: cost * feeRate };
  });
  return [sale, ...buys];
}

/** USDT left over after the buy-in trades (negative means it spends more than the sale raised). */
export function usdtAfter(trades: DraftTrade[]): number {
  return trades.reduce((usdt, t) => usdt + (t.side === "sell" ? 1 : -1) * t.qty * t.priceUsd - t.feeUsd, 0);
}

/** The same rules the database enforces, as messages a person can act on. */
export function checkBuyIn(btcIn: number, basket: string[], trades: DraftTrade[]): string[] {
  const errors: string[] = [];
  if (!(btcIn > 0) || btcIn > RULES.maxBtcIn) errors.push(`Put in more than 0 and at most ${RULES.maxBtcIn} BTC.`);

  const sales = trades.filter((t) => t.asset === BTC);
  if (sales.length !== 1 || sales[0].side !== "sell" || Math.abs(sales[0].qty - btcIn) > 1e-9)
    errors.push("The buy-in sells exactly the BTC you put in.");

  const buys = trades.filter((t) => t.asset !== BTC);
  if (buys.some((t) => t.side !== "buy" || !basket.includes(t.asset)))
    errors.push("The buy-in only buys coins in your basket.");
  if (basket.some((c) => !buys.some((t) => t.asset === c))) errors.push("Buy some of every coin in your basket.");
  if (trades.some((t) => !(t.qty > 0) || !(t.priceUsd > 0) || t.feeUsd < 0))
    errors.push("Every amount and price must be above zero.");

  const left = usdtAfter(trades);
  if (left < -0.01) errors.push(`These buys spend $${(-left).toFixed(2)} more than the BTC sale raised.`);
  return errors;
}
