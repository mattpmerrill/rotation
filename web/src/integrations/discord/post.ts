const DEFAULT_TIMEOUT_MS = 10_000;

export interface PostOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Post a message to the group's Discord channel through its webhook. False when no webhook is
 * configured (nothing was sent); throws when Discord is unreachable or refuses, so the caller can
 * release whatever it claimed and retry on the next run. The message mentions no one.
 *
 * The only place that knows Discord exists. Callers pass text only: Discord shows names, coins and
 * BTC multiples, never amounts or holdings.
 */
export async function postToDiscord(
  webhookUrl: string | undefined,
  content: string,
  options: PostOptions = {},
): Promise<boolean> {
  if (!webhookUrl) return false;
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
  return true;
}
