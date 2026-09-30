"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/data/guards";
import { firstIssue } from "@/lib/first-issue";
import { formMessages } from "@/lib/result";
import { buyInInput, entryIdArgument, entryIdField } from "./schema";
import { deleteBasket, enterChallenge, redoBuyIn } from "./service";

/**
 * Transport for the buy-in use cases (architecture.md): authenticate, validate, call one service,
 * turn its result into what the form shows, and redirect on success. No rules live here. Each
 * action starts with requireMember() because Server Actions can be posted to directly.
 */
export interface BuyInState {
  errors?: string[];
}

const UNREADABLE = "Something went wrong reading the form. Reload and try again.";

/** The buy-in the picker submits as JSON in one form field, validated against the schema. */
function readBuyIn(form: FormData) {
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { errors: [UNREADABLE] };
  }
  const parsed = buyInInput.safeParse(payload);
  return parsed.success ? { input: parsed.data } : { errors: parsed.error.issues.map((i) => i.message) };
}

/** Start the viewer's entry, then go to it. */
export async function startChallenge(_: BuyInState, form: FormData): Promise<BuyInState> {
  const viewer = await requireMember();
  const read = readBuyIn(form);
  if (!read.input) return { errors: read.errors };

  const result = await enterChallenge(viewer, read.input);
  if (!result.ok) return { errors: formMessages(result.error) };
  revalidatePath("/", "layout");
  redirect(`/entries/${result.data.entryId}`);
}

/** Redo the viewer's buy-in, then go back to the entry. */
export async function editBasket(_: BuyInState, form: FormData): Promise<BuyInState> {
  const viewer = await requireMember();
  const entryId = entryIdField.safeParse(form.get("entryId"));
  if (!entryId.success) return { errors: [UNREADABLE] };
  const read = readBuyIn(form);
  if (!read.input) return { errors: read.errors };

  const result = await redoBuyIn(viewer, entryId.data, read.input);
  if (!result.ok) return { errors: formMessages(result.error) };
  revalidatePath("/", "layout");
  redirect(`/entries/${result.data.entryId}`);
}

/** Delete the viewer's basket and every trade in it, then go back to the picker. */
export async function removeBasket(entryId: number): Promise<{ error?: string }> {
  const viewer = await requireMember();
  const id = entryIdArgument.safeParse(entryId);
  if (!id.success) return { error: firstIssue(id.error) };

  const result = await deleteBasket(viewer, id.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  redirect("/pick");
}
