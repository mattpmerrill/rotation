"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteEntry,
  editEntry,
  findEntryFor,
  getCurrentChallenge,
  getEntry,
  listTrades,
  startEntry,
} from "@/data/challenge";
import { getEligibleCoins } from "@/data/prices";
import { requireMember } from "@/data/viewer";
import { checkBasket } from "@/domain/basket";
import { checkBuyIn, editLockedReason } from "@/domain/buy-in";
import { addDays, laterDay, todayUtc } from "@/lib/days";
import { editableCoins, editWindow } from "./queries";
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
  const earliest = laterDay(challenge.openedOn, addDays(today, -BUY_IN_LOOKBACK_DAYS));
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

/** Redo the viewer's buy-in (coins, slots, BTC in, date, trades). Only while nothing but the
 *  buy-in has been logged; the database checks the same. */
export async function editBasket(_: BuyInState, form: FormData): Promise<BuyInState> {
  const viewer = await requireMember();
  const entryId = Number(form.get("entryId"));
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { errors: ["Something went wrong reading the form. Reload and try again."] };
  }
  const parsed = buyInInput.safeParse(payload);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const input = parsed.data;

  const entry = Number.isInteger(entryId) ? await getEntry(entryId) : null;
  if (!entry || entry.userId !== viewer.id) return { errors: ["You can only edit your own basket."] };
  const trades = await listTrades([entry.id]);
  const lock = editLockedReason(trades);
  if (lock) return { errors: [lock] };

  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.id !== entry.challengeId || challenge.closedOn)
    return { errors: ["This challenge has closed."] };
  const [earliest, today] = editWindow(challenge.openedOn, entry.startedOn);
  if (input.startedOn < earliest || input.startedOn > today)
    return { errors: [`The buy-in date must be between ${earliest} and today.`] };

  const errors = [
    ...checkBasket(input.basket, await editableCoins(entry.basket), input.slots).errors,
    ...checkBuyIn(input.btcIn, input.basket, input.slots, input.trades),
  ];
  if (errors.length) return { errors };

  const error = await editEntry(entry.id, input.startedOn, input.btcIn, input.basket, input.slots, input.trades);
  if (error) return { errors: [error] };
  revalidatePath("/", "layout");
  redirect(`/entries/${entry.id}`);
}

/** Delete the viewer's basket and every trade in it. */
export async function removeBasket(entryId: number): Promise<{ error?: string }> {
  const viewer = await requireMember();
  const entry = Number.isInteger(entryId) ? await getEntry(entryId) : null;
  if (!entry || entry.userId !== viewer.id) return { error: "You can only delete your own basket." };
  const error = await deleteEntry(entry.id);
  if (error) return { error };
  revalidatePath("/", "layout");
  redirect("/pick");
}
