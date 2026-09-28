import { addDays, earlierDay, laterDay } from "@/lib/days";
import { RULES } from "./rules";
import { BTC, type Day, type Side } from "./types";

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
  /** Waiting slots: each keeps an equal share of the BTC as BTC. */
  slots: number;
  feeRate: number;
}

/** The days a new buy-in can be dated: back to the challenge's opening or `buyInLookbackDays`
 *  ago, whichever is later, up to today. Returns [earliest, latest]. */
export function buyInWindow(openedOn: Day, today: Day): [Day, Day] {
  return [laterDay(openedOn, addDays(today, -RULES.buyInLookbackDays)), today];
}

/** The days an edited buy-in can be dated: the usual window, stretched back to the current
 *  buy-in date so an entry that is already outside it can still be saved as it was. */
export function editWindow(openedOn: Day, startedOn: Day, today: Day): [Day, Day] {
  const [usual, latest] = buyInWindow(openedOn, today);
  return [earlierDay(usual, startedOn), latest];
}

/** BTC the buy-in sells: the coins' share. The waiting slots' share stays BTC. */
export function btcSoldAtBuyIn(btcIn: number, coins: number, slots: number): number {
  return (btcIn * coins) / (coins + slots);
}

/**
 * The trades that swap the coins' share of `btcIn` into the basket in equal dollar amounts:
 * sell that BTC for USDT (less the fee), then spend the USDT equally, each buy's fee included,
 * so nothing is left. Each waiting slot's share stays as BTC.
 */
export function planBuyIn({ btcIn, btcPriceUsd, coinPricesUsd, basket, slots, feeRate }: BuyInInput): DraftTrade[] {
  const sold = btcSoldAtBuyIn(btcIn, basket.length, slots);
  const gross = sold * btcPriceUsd;
  const sale: DraftTrade = { asset: BTC, side: "sell", qty: sold, priceUsd: btcPriceUsd, feeUsd: gross * feeRate };
  const perCoin = (gross - sale.feeUsd) / basket.length;
  const buys = basket.map((asset): DraftTrade => {
    const priceUsd = coinPricesUsd[asset];
    if (priceUsd === undefined) throw new Error(`planBuyIn: no price for ${asset}`);
    const cost = perCoin / (1 + feeRate); // cost + fee = perCoin
    return { asset, side: "buy", qty: cost / priceUsd, priceUsd, feeUsd: cost * feeRate };
  });
  return [sale, ...buys];
}

/**
 * Why the buy-in can't be edited, or null if it can. Sells, rebuys and slot fills depend on the
 * buy-in, so once any is logged the buy-in is locked. The database enforces the same (edit_entry()).
 */
export function editLockedReason(trades: { kind: string }[]): string | null {
  return trades.some((t) => t.kind !== "buy_in")
    ? "You've logged trades since the buy-in, so it's locked. Delete your sells and rebuys to edit it, or delete the basket and start again."
    : null;
}

/** USDT left over after the buy-in trades (negative means it spends more than the sale raised). */
export function usdtAfter(trades: DraftTrade[]): number {
  return trades.reduce((usdt, t) => usdt + (t.side === "sell" ? 1 : -1) * t.qty * t.priceUsd - t.feeUsd, 0);
}

/** The same rules the database enforces, as messages a person can act on. */
export function checkBuyIn(btcIn: number, basket: string[], slots: number, trades: DraftTrade[]): string[] {
  const errors: string[] = [];
  if (!(btcIn > 0) || btcIn > RULES.maxBtcIn) errors.push(`Put in more than 0 and at most ${RULES.maxBtcIn} BTC.`);

  const sales = trades.filter((t) => t.asset === BTC);
  const sale = sales[0];
  if (
    sales.length !== 1 ||
    sale?.side !== "sell" ||
    Math.abs(sale.qty - btcSoldAtBuyIn(btcIn, basket.length, slots)) > 1e-9
  )
    errors.push(
      slots
        ? "The buy-in sells the coins' share of your BTC and keeps the slots' share."
        : "The buy-in sells exactly the BTC you put in.",
    );

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
