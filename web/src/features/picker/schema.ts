import { z } from "zod";
import { RULES } from "@/domain/rules";
import { isDay } from "@/lib/days";

/** A buy-in can be logged up to this many days after it happened. */
export const BUY_IN_LOOKBACK_DAYS = 30;

const draftTrade = z.object({
  asset: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive(),
  priceUsd: z.number().positive(),
  feeUsd: z.number().min(0),
});

/** The buy-in the picker submits (as JSON in one form field). */
export const buyInInput = z.object({
  startedOn: z.string().refine(isDay, "Pick the day you bought in."),
  btcIn: z.number().positive().max(RULES.maxBtcIn, `Put in at most ${RULES.maxBtcIn} BTC.`),
  basket: z.array(z.string().min(1)).min(RULES.basketMin).max(RULES.basketMax),
  trades: z.array(draftTrade).min(RULES.basketMin + 1),
});

export type BuyInInput = z.infer<typeof buyInInput>;
