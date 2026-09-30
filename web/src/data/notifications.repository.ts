import "server-only";
import { logEvent } from "@/lib/log";
import { postToDiscord } from "./discord";
import { supabaseAdmin } from "./supabase/admin";

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

/** Post `text` to Discord once per `key`, however many times this is called. Best effort: this runs
 *  alongside something that matters more (a sign-up), so a failure is logged and never thrown. */
export async function announceOnce(key: string, text: string): Promise<void> {
  try {
    if (!(await claimNotification(key))) return;
    try {
      if (!(await postToDiscord(text))) await releaseNotification(key); // no webhook yet: try again later
    } catch (err) {
      await releaseNotification(key);
      throw err;
    }
  } catch (err) {
    logEvent("error", "notification.announce_failed", {
      key,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
