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
