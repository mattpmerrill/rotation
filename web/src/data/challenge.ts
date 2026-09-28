import "server-only";
import type { DraftTrade } from "@/domain/buy-in";
import type { Challenge, Entry, Side, Trade, TradeKind } from "@/domain/types";
import type { Database } from "./database.types";
import { supabaseServer, type Db } from "./supabase/server";

type EntryRow = Database["public"]["Tables"]["entries"]["Row"] & { profiles: { display_name: string | null } | null };
type TradeRow = Database["public"]["Tables"]["entry_trades"]["Row"];

const ENTRY_COLUMNS =
  "id, challenge_id, user_id, started_on, btc_in, basket, open_slots, created_at, profiles(display_name)";

const toEntry = (r: EntryRow): Entry => ({
  id: r.id,
  challengeId: r.challenge_id,
  userId: r.user_id,
  playerName: r.profiles?.display_name ?? "Player",
  startedOn: r.started_on,
  btcIn: Number(r.btc_in),
  basket: r.basket,
  openSlots: r.open_slots,
});

const toTrade = (r: TradeRow): Trade => ({
  id: r.id,
  entryId: r.entry_id,
  tradedOn: r.traded_on,
  asset: r.asset,
  side: r.side as Side,
  qty: Number(r.qty),
  priceUsd: Number(r.price_usd),
  feeUsd: Number(r.fee_usd),
  kind: r.kind as TradeKind,
  note: r.note,
});

/** The challenge that's running (at most one is open), or the most recent one. */
export async function getCurrentChallenge(db?: Db): Promise<Challenge | null> {
  db ??= await supabaseServer();
  const { data } = await db
    .from("challenges")
    .select("id, name, opened_on, closed_on")
    .order("closed_on", { ascending: false, nullsFirst: true })
    .order("opened_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data && { id: data.id, name: data.name, openedOn: data.opened_on, closedOn: data.closed_on };
}

export async function listEntries(challengeId: number, db?: Db): Promise<Entry[]> {
  db ??= await supabaseServer();
  const { data, error } = await db.from("entries").select(ENTRY_COLUMNS).eq("challenge_id", challengeId);
  if (error) throw error;
  return (data as unknown as EntryRow[]).map(toEntry);
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await supabaseServer();
  const { data } = await db.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  return data ? toEntry(data as unknown as EntryRow) : null;
}

export async function findEntryFor(userId: string, challengeId: number): Promise<Entry | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  return data ? toEntry(data as unknown as EntryRow) : null;
}

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

const toRpcTrades = (trades: DraftTrade[]) =>
  trades.map((t) => ({ asset: t.asset, side: t.side, qty: t.qty, price_usd: t.priceUsd, fee_usd: t.feeUsd }));

/** Start the viewer's entry: the entry and its buy-in trades in one transaction. */
export async function startEntry(
  startedOn: string,
  btcIn: number,
  basket: string[],
  slots: number,
  trades: DraftTrade[],
) {
  const db = await supabaseServer();
  const { data, error } = await db.rpc("start_entry", {
    p_started_on: startedOn,
    p_btc_in: btcIn,
    p_basket: basket,
    p_slots: slots,
    p_trades: toRpcTrades(trades),
  });
  return { entryId: data ?? null, error: error?.message ?? null };
}

/** Redo the viewer's buy-in: allowed only while the buy-in is all the entry has. */
export async function editEntry(
  entryId: number,
  startedOn: string,
  btcIn: number,
  basket: string[],
  slots: number,
  trades: DraftTrade[],
) {
  const db = await supabaseServer();
  const { error } = await db.rpc("edit_entry", {
    p_entry_id: entryId,
    p_started_on: startedOn,
    p_btc_in: btcIn,
    p_basket: basket,
    p_slots: slots,
    p_trades: toRpcTrades(trades),
  });
  return error?.message ?? null;
}

/** Delete the viewer's entry and all its trades. Returns an error, or null. */
export async function deleteEntry(entryId: number): Promise<string | null> {
  const db = await supabaseServer();
  const { error } = await db.rpc("delete_entry", { p_entry_id: entryId });
  return error?.message ?? null;
}

/** Fill one of the viewer's waiting slots with `coin`: one slot's BTC sold, the coin bought. */
export async function fillSlot(entryId: number, tradedOn: string, coin: string, trades: DraftTrade[]) {
  const db = await supabaseServer();
  const { error } = await db.rpc("fill_slot", {
    p_entry_id: entryId,
    p_traded_on: tradedOn,
    p_coin: coin,
    p_trades: toRpcTrades(trades),
  });
  return error?.message ?? null;
}

/** Log a sell (alt -> USDT) or a rebuy (USDT -> BTC). The only kinds people log directly. */
export async function addTrade(
  entryId: number,
  t: DraftTrade & { kind: "sell" | "rebuy"; tradedOn: string; note: string | null },
) {
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
  return error?.message ?? null;
}

/** Delete one of the viewer's trades (RLS refuses anyone else's). Returns an error, or null. */
export async function deleteTrade(tradeId: number): Promise<string | null> {
  const db = await supabaseServer();
  const { data, error } = await db.from("entry_trades").delete().eq("id", tradeId).select("id");
  if (error) return error.message;
  return data.length ? null : "That trade isn't yours to delete.";
}
