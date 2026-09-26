"use server";

import { revalidatePath } from "next/cache";
import { addTrade, deleteTrade, fillSlot, getEntry, listTrades } from "@/data/challenge";
import { getCoins, getEligibleCoins } from "@/data/prices";
import { requireMember } from "@/data/viewer";
import { balancesOn } from "@/domain/holdings";
import { usdtAfter } from "@/domain/buyIn";
import { slotsClosedReason, slotShare } from "@/domain/slots";
import { checkTrade } from "@/domain/trades";
import { BTC } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { fillInput, tradeInput } from "./schema";

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

  const error = await addTrade(entry.id, {
    ...draft,
    kind: t.kind === "buy_btc" ? "rebuy" : "sell",
    tradedOn: t.tradedOn,
    note: t.note,
  });
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

/** Fill one of the viewer's waiting slots with a coin in today's top 100. */
export async function fillWaitingSlot(_: TradeFormState, form: FormData): Promise<TradeFormState> {
  const viewer = await requireMember();
  const parsed = fillInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const f = parsed.data;

  const entry = await getEntry(f.entryId);
  if (!entry || entry.userId !== viewer.id) return { error: "You can only fill slots in your own basket." };
  const trades = await listTrades([entry.id]);
  const closed = slotsClosedReason(entry, trades);
  if (closed) return { error: closed };
  if (entry.basket.includes(f.coin)) return { error: "That coin is already in your basket." };
  const { coins } = await getEligibleCoins();
  if (!coins.some((c) => c.id === f.coin)) return { error: "Pick a coin from today's top 100." };
  if (f.tradedOn < entry.startedOn || f.tradedOn > todayUtc())
    return { error: "The date must be between your buy-in and today." };

  const share = slotShare(entry, trades);
  const gross = share * f.btcPriceUsd;
  const draft = [
    { asset: BTC, side: "sell" as const, qty: share, priceUsd: f.btcPriceUsd, feeUsd: gross * f.feeRate },
    {
      asset: f.coin,
      side: "buy" as const,
      qty: f.coinQty,
      priceUsd: f.coinPriceUsd,
      feeUsd: f.coinQty * f.coinPriceUsd * f.feeRate,
    },
  ];
  if (usdtAfter(draft) < -0.01) return { error: "That buys more of the coin than one slot's BTC pays for." };

  const error = await fillSlot(entry.id, f.tradedOn, f.coin, draft);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}
