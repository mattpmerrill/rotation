"use server";

import { revalidatePath } from "next/cache";
import { addTrade, deleteTrade, getEntry, listTrades } from "@/data/challenge";
import { getCoins } from "@/data/prices";
import { requireMember } from "@/data/viewer";
import { balancesOn } from "@/domain/holdings";
import { checkTrade } from "@/domain/trades";
import { BTC } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { tradeInput } from "./schema";

export interface TradeFormState {
  error?: string;
  saved?: number;
}

/** Log a sell (alt -> USDT) or a rebuy (USDT -> BTC) on the viewer's own entry. The database
 *  refuses anything that would oversell, overspend, or trade outside the entry. */
export async function logTrade(_: TradeFormState, form: FormData): Promise<TradeFormState> {
  const viewer = await requireMember();
  const parsed = tradeInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const t = parsed.data;

  const entry = await getEntry(t.entryId);
  if (!entry || entry.userId !== viewer.id) return { error: "You can only log trades in your own basket." };
  if (t.kind === "sell_alt" && !entry.basket.includes(t.asset)) return { error: "Pick a coin from your basket." };
  if (t.tradedOn < entry.startedOn || t.tradedOn > todayUtc())
    return { error: "The date must be between your buy-in and today." };

  const draft = {
    asset: t.kind === "buy_btc" ? BTC : t.asset,
    side: t.kind === "buy_btc" ? ("buy" as const) : ("sell" as const),
    qty: t.qty,
    priceUsd: t.priceUsd,
    feeUsd: t.feeUsd,
  };
  const [trades, coins] = await Promise.all([listTrades([entry.id]), getCoins([draft.asset])]);
  const problem = checkTrade(balancesOn(entry, trades), draft, coins[draft.asset]?.symbol ?? draft.asset);
  if (problem) return { error: problem };

  const error = await addTrade(entry.id, { ...draft, tradedOn: t.tradedOn, note: t.note });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}

export async function removeTrade(tradeId: number): Promise<{ error?: string }> {
  await requireMember();
  const error = await deleteTrade(tradeId);
  if (error) return { error };
  revalidatePath("/", "layout");
  return {};
}
