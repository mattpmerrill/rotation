import { z } from "zod";
import { isDay } from "@/lib/days";

/** A trade after the buy-in: selling an alt for USDT, or rebuying BTC with USDT. */
export const tradeInput = z.object({
  entryId: z.coerce.number().int().positive(),
  kind: z.enum(["sell_alt", "buy_btc"]),
  asset: z.string().min(1),
  tradedOn: z.string().refine(isDay, "Pick a date."),
  qty: z.coerce.number().positive("Enter an amount above zero."),
  priceUsd: z.coerce.number().positive("Enter a price above zero."),
  feeUsd: z.coerce.number().min(0, "The fee can't be negative."),
  note: z
    .string()
    .trim()
    .max(280)
    .transform((s) => s || null),
});

export type TradeInput = z.infer<typeof tradeInput>;

/** The id a client passes to delete a trade. Server Action arguments are untrusted input. */
export const tradeIdInput = z.number("Something went wrong. Reload and try again.").int().positive();

/** Filling a waiting slot. The BTC sold is always one slot's share, worked out on the server. */
export const fillInput = z.object({
  entryId: z.coerce.number().int().positive(),
  coin: z.string().min(1, "Pick a coin."),
  tradedOn: z.string().refine(isDay, "Pick a date."),
  btcPriceUsd: z.coerce.number().positive("Enter BTC's price."),
  coinPriceUsd: z.coerce.number().positive("Enter the coin's price."),
  coinQty: z.coerce.number().positive("Enter how much you bought."),
  feeRate: z.coerce.number().min(0).max(0.1),
});

export type FillInput = z.infer<typeof fillInput>;
