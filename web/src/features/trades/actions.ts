"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/data/guards";
import { firstIssue } from "@/lib/first-issue";
import { fillInput, tradeIdInput, tradeInput } from "./schema";
import { fillSlotWithCoin, recordTrade, retractTrade } from "./service";

/**
 * Transport for the trade use cases (architecture.md): authenticate, validate the input, call one
 * service, and turn its result into what the form shows. No rules live here. The proxy is not the
 * authorization boundary, and Server Actions can be posted to directly, so each one starts with
 * requireMember() and treats its arguments as untrusted.
 */
export interface TradeFormState {
  error?: string;
  saved?: number;
}

/** Log a sell (alt -> USDT) or a rebuy (USDT -> BTC) on the viewer's own entry. */
export async function logTrade(_: TradeFormState, form: FormData): Promise<TradeFormState> {
  const viewer = await requireMember();
  const parsed = tradeInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await recordTrade(viewer, parsed.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}

export async function removeTrade(tradeId: number): Promise<{ error?: string }> {
  await requireMember();
  const id = tradeIdInput.safeParse(tradeId);
  if (!id.success) return { error: firstIssue(id.error) };

  const result = await retractTrade(id.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  return {};
}

/** Fill one of the viewer's waiting slots with a coin in today's top 100. */
export async function fillWaitingSlot(_: TradeFormState, form: FormData): Promise<TradeFormState> {
  const viewer = await requireMember();
  const parsed = fillInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await fillSlotWithCoin(viewer, parsed.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}
