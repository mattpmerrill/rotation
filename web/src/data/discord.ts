import "server-only";
import { env } from "./env";

/** Post a message to the group's Discord channel. False when no webhook is configured. */
export async function postToDiscord(content: string): Promise<boolean> {
  const url = env().DISCORD_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
  return true;
}
