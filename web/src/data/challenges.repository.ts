import "server-only";
import type { Challenge } from "@/domain/types";
import { supabaseServer, type Db } from "./supabase/server";

/** The repository for `challenges`: the only place that table is queried. */

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
