import { describe, expect, it, vi } from "vitest";
import { postToDiscord } from "./post";

function scripted(status: number, body = "") {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(status === 204 ? null : body, { status });
  }) as unknown as typeof fetch; // a scripted stand-in for fetch: only the call's url and init are read
  return { fetchImpl, calls };
}

describe("postToDiscord", () => {
  it("posts the text to the webhook without mentioning anyone", async () => {
    const { fetchImpl, calls } = scripted(204);
    expect(await postToDiscord("https://discord.example/hook", "hello", { fetchImpl })).toBe(true);
    expect(calls[0]?.url).toBe("https://discord.example/hook");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ content: "hello", allowed_mentions: { parse: [] } });
  });

  it("sends nothing and says so when no webhook is configured", async () => {
    const { fetchImpl } = scripted(204);
    expect(await postToDiscord(undefined, "hello", { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when Discord refuses, so the caller can retry later", async () => {
    const { fetchImpl } = scripted(500, "boom");
    await expect(postToDiscord("https://discord.example/hook", "hello", { fetchImpl })).rejects.toThrow(
      "Discord answered 500",
    );
  });

  it("gives every call a timeout", async () => {
    const { fetchImpl, calls } = scripted(204);
    await postToDiscord("https://discord.example/hook", "hello", { fetchImpl });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
