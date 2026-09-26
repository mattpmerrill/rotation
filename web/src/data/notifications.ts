import "server-only";
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
