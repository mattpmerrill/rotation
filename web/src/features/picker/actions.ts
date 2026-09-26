"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findEntryFor, getCurrentChallenge, startEntry } from "@/data/challenge";
import { getEligibleCoins } from "@/data/prices";
import { requireMember } from "@/data/viewer";
import { checkBasket } from "@/domain/basket";
import { checkBuyIn } from "@/domain/buyIn";
import { addDays, todayUtc } from "@/lib/days";
import { BUY_IN_LOOKBACK_DAYS, buyInInput } from "./schema";

export interface BuyInState {
  errors?: string[];
}

/** Start the viewer's entry: check the basket and the buy-in, then save both at once. */
export async function startChallenge(_: BuyInState, form: FormData): Promise<BuyInState> {
  const viewer = await requireMember();
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { errors: ["Something went wrong reading the form. Reload and try again."] };
  }
  const parsed = buyInInput.safeParse(payload);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const input = parsed.data;

  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.closedOn) return { errors: ["No challenge is open right now."] };
  if (await findEntryFor(viewer.id, challenge.id)) return { errors: ["You're already in this challenge."] };

  const today = todayUtc();
  const earliest = [challenge.openedOn, addDays(today, -BUY_IN_LOOKBACK_DAYS)].sort().at(-1)!;
  if (input.startedOn < earliest || input.startedOn > today)
    return { errors: [`The buy-in date must be between ${earliest} and today.`] };

  const { coins } = await getEligibleCoins();
  const errors = [
    ...checkBasket(input.basket, coins, input.slots).errors,
    ...checkBuyIn(input.btcIn, input.basket, input.slots, input.trades),
  ];
  if (errors.length) return { errors };

  const { entryId, error } = await startEntry(input.startedOn, input.btcIn, input.basket, input.slots, input.trades);
  if (error || !entryId) return { errors: [error ?? "The buy-in wasn't saved. Try again."] };
  revalidatePath("/", "layout");
  redirect(`/entries/${entryId}`);
}
