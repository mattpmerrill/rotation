import "server-only";
import { getEntry } from "@/data/challenge";
import { getCoins, getEligibleCoins } from "@/data/prices";
import { addTrade, deleteTrade, fillSlot, listTrades } from "@/data/trades";
import type { Viewer } from "@/data/viewer";
import { usdtAfter } from "@/domain/buy-in";
import { balancesOn } from "@/domain/holdings";
import { slotsClosedReason, slotShare } from "@/domain/slots";
import { checkTrade } from "@/domain/trades";
import { BTC } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { fail, ok, type ApplicationResult } from "@/lib/result";
import type { FillInput, TradeInput } from "./schema";

/**
 * The trade use cases (architecture.md: the service is the use case). Each one takes input that
 * the Server Action has already authenticated and validated, applies the challenge rules, and asks
 * the repository to write. It knows nothing about forms, HTTP or cache revalidation, and returns
 * an ApplicationResult with a stable error code. The database enforces the same rules again.
 */

const WITHIN_THE_ENTRY = "The date must be between your buy-in and today.";

/** Log a sell (alt -> USDT) or a rebuy (USDT -> BTC) on the viewer's own entry. */
export async function recordTrade(viewer: Viewer, t: TradeInput): Promise<ApplicationResult<null>> {
  const entry = await getEntry(t.entryId);
  if (!entry || entry.userId !== viewer.id) return fail("forbidden", "You can only log trades in your own basket.");
  if (t.kind === "sell_alt" && !entry.basket.includes(t.asset))
    return fail("rule_violation", "Pick a coin from your basket.");
  if (t.tradedOn < entry.startedOn || t.tradedOn > todayUtc()) return fail("rule_violation", WITHIN_THE_ENTRY);

  const draft = {
    asset: t.kind === "buy_btc" ? BTC : t.asset,
    side: t.kind === "buy_btc" ? ("buy" as const) : ("sell" as const),
    qty: t.qty,
    priceUsd: t.priceUsd,
    feeUsd: t.feeUsd,
  };
  const [trades, coins] = await Promise.all([listTrades([entry.id]), getCoins([draft.asset])]);
  const problem = checkTrade(balancesOn(entry, trades), draft, coins[draft.asset]?.symbol ?? draft.asset);
  if (problem) return fail("rule_violation", problem);

  return addTrade(entry.id, {
    ...draft,
    kind: t.kind === "buy_btc" ? "rebuy" : "sell",
    tradedOn: t.tradedOn,
    note: t.note,
  });
}

/** Delete one of the viewer's own sells or rebuys. Row-level security decides whose trade it is. */
export async function retractTrade(tradeId: number): Promise<ApplicationResult<null>> {
  const result = await deleteTrade(tradeId);
  if (!result.ok) return result;
  if (!result.data.deleted) return fail("forbidden", "That trade isn't yours to delete.");
  return ok(null);
}

/** Fill one of the viewer's waiting slots with a coin in today's top 100. */
export async function fillSlotWithCoin(viewer: Viewer, f: FillInput): Promise<ApplicationResult<null>> {
  const entry = await getEntry(f.entryId);
  if (!entry || entry.userId !== viewer.id) return fail("forbidden", "You can only fill slots in your own basket.");
  const trades = await listTrades([entry.id]);
  const closed = slotsClosedReason(entry, trades);
  if (closed) return fail("rule_violation", closed);
  if (entry.basket.includes(f.coin)) return fail("rule_violation", "That coin is already in your basket.");
  const { coins } = await getEligibleCoins();
  if (!coins.some((c) => c.id === f.coin)) return fail("rule_violation", "Pick a coin from today's top 100.");
  if (f.tradedOn < entry.startedOn || f.tradedOn > todayUtc()) return fail("rule_violation", WITHIN_THE_ENTRY);

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
  if (usdtAfter(draft) < -0.01)
    return fail("rule_violation", "That buys more of the coin than one slot's BTC pays for.");

  return fillSlot(entry.id, f.tradedOn, f.coin, draft);
}
