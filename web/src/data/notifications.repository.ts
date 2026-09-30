import "server-only";
import { supabaseAdmin } from "./supabase/admin";

/** The repository for `notifications`: a row per Discord post already sent, keyed by what it was
 *  about, so a job that runs twice posts once. */

/** Record that the notification `key` was sent. True the first time, false if it already was:
 *  the job posts each notification once however often it runs. */
export async function claimNotification(key: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("notifications")
    .upsert({ key }, { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  if (error) throw error;
  return data.length > 0;
}

/** Undo a claim when sending failed, so the next run retries. */
export async function releaseNotification(key: string): Promise<void> {
  await supabaseAdmin().from("notifications").delete().eq("key", key);
}

/**
 * Run `send` at most once per `key`, however many times this is called: claim the key first, and
 * release it if `send` reports nothing was sent (false: no webhook yet) or throws, so the next run
 * tries again. Returns true when `send` ran and sent. `send` is the caller's, so this layer knows
 * nothing about Discord.
 */
export async function sendOnce(key: string, send: () => Promise<boolean>): Promise<boolean> {
  if (!(await claimNotification(key))) return false;
  try {
    if (await send()) return true;
    await releaseNotification(key);
    return false;
  } catch (err) {
    await releaseNotification(key);
    throw err;
  }
}
