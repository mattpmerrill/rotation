import "server-only";
import { deleteEntry, editEntry, findEntryFor, getEntry, startEntry } from "@/data/entries.repository";
import { getCurrentChallenge } from "@/data/challenges.repository";
import { getEligibleCoins } from "@/data/prices.repository";
import { listTrades } from "@/data/trades.repository";
import type { Viewer } from "@/domain/viewer";
import { checkBasket } from "@/domain/basket";
import { buyInWindow, checkBuyIn, editLockedReason, editWindow } from "@/domain/buy-in";
import { todayUtc } from "@/lib/days";
import { fail, FORM, ok, type ApplicationResult } from "@/lib/result";
import { editableCoins } from "./editable-coins";
import type { BuyInInput } from "./schema";

/**
 * The buy-in use cases (architecture.md: the service is the use case): start an entry, redo its
 * buy-in, delete it. Each takes input the Server Action has already authenticated and validated,
 * applies the challenge rules, and asks the repository to write. The database enforces the same
 * rules again, so where it refuses anyway (a race, a direct call) the repository's typed failure is
 * mapped to the clearest message this layer can give.
 */

const NO_CHALLENGE = "No challenge is open right now.";
const ALREADY_IN = "You're already in this challenge.";
const CLOSED = "This challenge has closed.";

/** Several rule problems found at once, shown as a list under the form. */
const brokenRules = (messages: string[]) => fail("rule_violation", messages.join(" "), { [FORM]: messages });

const outsideWindow = (earliest: string) => `The buy-in date must be between ${earliest} and today.`;

/** Start the viewer's entry: check the basket and the buy-in, then save both at once. */
export async function enterChallenge(
  viewer: Viewer,
  input: BuyInInput,
): Promise<ApplicationResult<{ entryId: number }>> {
  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.closedOn) return fail("not_found", NO_CHALLENGE);
  if (await findEntryFor(viewer.id, challenge.id)) return fail("conflict", ALREADY_IN);

  const [earliest, latest] = buyInWindow(challenge.openedOn, todayUtc());
  if (input.startedOn < earliest || input.startedOn > latest) return fail("rule_violation", outsideWindow(earliest));

  const { coins } = await getEligibleCoins();
  const errors = [
    ...checkBasket(input.basket, coins, input.slots).errors,
    ...checkBuyIn(input.btcIn, input.basket, input.slots, input.trades),
  ];
  if (errors.length) return brokenRules(errors);

  const created = await startEntry(input.startedOn, input.btcIn, input.basket, input.slots, input.trades);
  if (created.ok) return created;
  // The database refused after our checks passed: someone else got there first.
  if (created.error.code === "conflict") return fail("conflict", ALREADY_IN);
  if (created.error.code === "not_found") return fail("not_found", NO_CHALLENGE);
  return created;
}

/** Redo the viewer's buy-in (coins, slots, BTC in, date, trades), only while nothing but the
 *  buy-in has been logged. */
export async function redoBuyIn(
  viewer: Viewer,
  entryId: number,
  input: BuyInInput,
): Promise<ApplicationResult<{ entryId: number }>> {
  const entry = await getEntry(entryId);
  if (!entry || entry.userId !== viewer.id) return fail("forbidden", "You can only edit your own basket.");
  const locked = editLockedReason(await listTrades([entry.id]));
  if (locked) return fail("rule_violation", locked);

  const challenge = await getCurrentChallenge();
  if (!challenge || challenge.id !== entry.challengeId || challenge.closedOn) return fail("rule_violation", CLOSED);
  const [earliest, latest] = editWindow(challenge.openedOn, entry.startedOn, todayUtc());
  if (input.startedOn < earliest || input.startedOn > latest) return fail("rule_violation", outsideWindow(earliest));

  const errors = [
    ...checkBasket(input.basket, await editableCoins(entry.basket), input.slots).errors,
    ...checkBuyIn(input.btcIn, input.basket, input.slots, input.trades),
  ];
  if (errors.length) return brokenRules(errors);

  const saved = await editEntry(entry.id, input.startedOn, input.btcIn, input.basket, input.slots, input.trades);
  return saved.ok ? ok({ entryId: entry.id }) : saved;
}

/** Delete the viewer's basket and every trade in it. */
export async function deleteBasket(viewer: Viewer, entryId: number): Promise<ApplicationResult<null>> {
  const entry = await getEntry(entryId);
  if (!entry || entry.userId !== viewer.id) return fail("forbidden", "You can only delete your own basket.");
  return deleteEntry(entry.id);
}
