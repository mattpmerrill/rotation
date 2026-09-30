import "server-only";
import type { DraftTrade } from "@/domain/buy-in";
import type { Side, Trade, TradeKind } from "@/domain/types";
import { ok, type ApplicationResult } from "@/lib/result";
import type { Database } from "./database.types";
import { dbFailure } from "./failure";
import { supabaseServer, type Db } from "./supabase/server";

/**
 * The repository for `entry_trades`: the only place a query against that table (or the
 * `fill_slot` function) is built (architecture.md). Reads throw on failure, which is unexpected
 * for a read; writes return an ApplicationResult, with database failures translated by
 * dbFailure so no database text reaches a user.
 */
type TradeRow = Database["public"]["Tables"]["entry_trades"]["Row"];

/** The table's check constraints allow only these values; a different one means the schema and the
 *  app have drifted apart, which is worth failing loudly for. */
function sideOf(value: string): Side {
  if (value === "buy" || value === "sell") return value;
  throw new Error(`Unknown trade side from the database: ${value}`);
}

function kindOf(value: string): TradeKind {
  if (value === "buy_in" || value === "fill" || value === "sell" || value === "rebuy") return value;
  throw new Error(`Unknown trade kind from the database: ${value}`);
}

const toTrade = (r: TradeRow): Trade => ({
  id: r.id,
  entryId: r.entry_id,
  tradedOn: r.traded_on,
  asset: r.asset,
  side: sideOf(r.side),
  qty: Number(r.qty),
  priceUsd: Number(r.price_usd),
  feeUsd: Number(r.fee_usd),
  kind: kindOf(r.kind),
  note: r.note,
});

/** The JSON the database functions take for a list of trades. */
export const toRpcTrades = (trades: DraftTrade[]) =>
  trades.map((t) => ({ asset: t.asset, side: t.side, qty: t.qty, price_usd: t.priceUsd, fee_usd: t.feeUsd }));

/** Trades for the given entries, oldest first. */
export async function listTrades(entryIds: number[], db?: Db): Promise<Trade[]> {
  if (!entryIds.length) return [];
  db ??= await supabaseServer();
  const { data, error } = await db
    .from("entry_trades")
    .select("*")
    .in("entry_id", entryIds)
    .order("traded_on")
    .order("id");
  if (error) throw error;
  return data.map(toTrade);
}

/** Log a sell (alt -> USDT) or a rebuy (USDT -> BTC). The only kinds people log directly. */
export async function addTrade(
  entryId: number,
  t: DraftTrade & { kind: "sell" | "rebuy"; tradedOn: string; note: string | null },
): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.from("entry_trades").insert({
    entry_id: entryId,
    traded_on: t.tradedOn,
    asset: t.asset,
    side: t.side,
    qty: t.qty,
    price_usd: t.priceUsd,
    fee_usd: t.feeUsd,
    kind: t.kind,
    note: t.note,
  });
  return error ? dbFailure("trade.add", error) : ok(null);
}

/** Delete one trade. Row-level security lets a person delete only their own sells and rebuys, so a
 *  trade that is someone else's, a buy-in, or already gone deletes nothing: `deleted` is false. */
export async function deleteTrade(tradeId: number): Promise<ApplicationResult<{ deleted: boolean }>> {
  const db = await supabaseServer();
  const { data, error } = await db.from("entry_trades").delete().eq("id", tradeId).select("id");
  if (error) return dbFailure("trade.delete", error);
  return ok({ deleted: data.length > 0 });
}

/** Fill one waiting slot with `coin`: one slot's BTC sold, the coin bought, in one transaction. */
export async function fillSlot(
  entryId: number,
  tradedOn: string,
  coin: string,
  trades: DraftTrade[],
): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("fill_slot", {
    p_entry_id: entryId,
    p_traded_on: tradedOn,
    p_coin: coin,
    p_trades: toRpcTrades(trades),
  });
  return error ? dbFailure("slot.fill", error) : ok(null);
}
