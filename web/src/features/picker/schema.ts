import { z } from "zod";
import { RULES } from "@/domain/rules";
import { isDay } from "@/lib/days";

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
  basket: z.array(z.string().min(1)).min(1).max(RULES.basketMax),
  /** Waiting slots, kept as BTC to fill later. */
  slots: z
    .number()
    .int()
    .min(0)
    .max(RULES.basketMax - 1),
  trades: z.array(draftTrade).min(2),
});

export type BuyInInput = z.infer<typeof buyInInput>;

/** The entry id in the edit form's hidden field: form fields arrive as strings. */
export const entryIdField = z.coerce.number("Something went wrong. Reload and try again.").int().positive();

/** The entry id a client component passes to a Server Action as an argument. Untrusted input, and
 *  it arrives typed, so it must already be a number. */
export const entryIdArgument = z.number("Something went wrong. Reload and try again.").int().positive();
