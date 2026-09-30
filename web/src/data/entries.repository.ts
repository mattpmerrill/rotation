import "server-only";
import type { DraftTrade } from "@/domain/buy-in";
import type { Entry } from "@/domain/types";
import { ok, type ApplicationResult } from "@/lib/result";
import type { Database } from "./database.types";
import { dbFailure } from "./failure";
import { supabaseServer, type Db } from "./supabase/server";
import { toRpcTrades } from "./trades.repository";

/**
 * The repository for `entries` and the functions that write them with their buy-in trades
 * (`start_entry`, `edit_entry`, `delete_entry`). The only place those are called. Reads throw on
 * failure; writes return an ApplicationResult with database failures translated by dbFailure.
 */
type EntryRow = Database["public"]["Tables"]["entries"]["Row"] & { profiles: { display_name: string | null } | null };

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

export async function listEntries(challengeId: number, db?: Db): Promise<Entry[]> {
  db ??= await supabaseServer();
  const { data, error } = await db.from("entries").select(ENTRY_COLUMNS).eq("challenge_id", challengeId);
  if (error) throw error;
  return data.map(toEntry);
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await supabaseServer();
  const { data, error } = await db.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toEntry(data) : null;
}

export async function findEntryFor(userId: string, challengeId: number): Promise<Entry | null> {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("entries")
    .select(ENTRY_COLUMNS)
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEntry(data) : null;
}

/** Start the viewer's entry: the entry and its buy-in trades in one transaction. */
export async function startEntry(
  startedOn: string,
  btcIn: number,
  basket: string[],
  slots: number,
  trades: DraftTrade[],
): Promise<ApplicationResult<{ entryId: number }>> {
  const db = await supabaseServer();
  const { data, error } = await db.rpc("start_entry", {
    p_started_on: startedOn,
    p_btc_in: btcIn,
    p_basket: basket,
    p_slots: slots,
    p_trades: toRpcTrades(trades),
  });
  if (error) return dbFailure("entry.start", error);
  if (data === null) return dbFailure("entry.start", { message: "start_entry returned no entry id" });
  return ok({ entryId: data });
}

/** Redo the viewer's buy-in: allowed only while the buy-in is all the entry has. */
export async function editEntry(
  entryId: number,
  startedOn: string,
  btcIn: number,
  basket: string[],
  slots: number,
  trades: DraftTrade[],
): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("edit_entry", {
    p_entry_id: entryId,
    p_started_on: startedOn,
    p_btc_in: btcIn,
    p_basket: basket,
    p_slots: slots,
    p_trades: toRpcTrades(trades),
  });
  return error ? dbFailure("entry.edit", error) : ok(null);
}

/** Delete the viewer's entry and all its trades. */
export async function deleteEntry(entryId: number): Promise<ApplicationResult<null>> {
  const db = await supabaseServer();
  const { error } = await db.rpc("delete_entry", { p_entry_id: entryId });
  return error ? dbFailure("entry.delete", error) : ok(null);
}
