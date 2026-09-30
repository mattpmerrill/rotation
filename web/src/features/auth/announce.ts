import "server-only";
import { env } from "@/data/env";
import { sendOnce } from "@/data/notifications.repository";
import { postToDiscord } from "@/integrations/discord";
import { logEvent } from "@/lib/log";

/** Post `text` to Discord once per `key`, however many times this is called. Best effort: this runs
 *  alongside something that matters more (a sign-up), so a failure is logged and never thrown. */
export async function announceOnce(key: string, text: string): Promise<void> {
  try {
    await sendOnce(key, () => postToDiscord(env().DISCORD_WEBHOOK_URL, text));
  } catch (err) {
    logEvent("error", "notification.announce_failed", {
      key,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
