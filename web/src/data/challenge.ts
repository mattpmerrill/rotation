import "server-only";
import type { DraftTrade } from "@/domain/buy-in";
import type { Challenge, Entry } from "@/domain/types";
import type { Database } from "./database.types";
import { toRpcTrades } from "./trades";
import { supabaseServer, type Db } from "./supabase/server";

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

/** The challenge that's running (at most one is open), or the most recent one. */
export async function getCurrentChallenge(db?: Db): Promise<Challenge | null> {
  db ??= await supabaseServer();
  const { data, error } = await db
    .from("challenges")
    .select("id, name, opened_on, closed_on")
    .order("closed_on", { ascending: false, nullsFirst: true })
    .order("opened_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
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
  const { data, error } = await db.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toEntry(data as unknown as EntryRow) : null;
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
  return data ? toEntry(data as unknown as EntryRow) : null;
}

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
