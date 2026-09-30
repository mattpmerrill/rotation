import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOnce } from "@/data/notifications.repository";
import { announceOnce } from "./announce";

vi.mock("server-only", () => ({}));
vi.mock("@/data/env", () => ({ env: () => ({ DISCORD_WEBHOOK_URL: "https://discord.example/hook" }) }));
vi.mock("@/data/notifications.repository", () => ({ sendOnce: vi.fn() }));
vi.mock("@/integrations/discord", () => ({ postToDiscord: vi.fn(async () => true) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function quiet() {
  vi.spyOn(console, "log").mockImplementation(() => {});
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("announceOnce", () => {
  it("hands the post to sendOnce under its key", async () => {
    vi.mocked(sendOnce).mockResolvedValue(true);
    await announceOnce("waiting:u1", "hello");
    expect(sendOnce).toHaveBeenCalledWith("waiting:u1", expect.any(Function));
  });

  it("never throws: a failure is logged as an error", async () => {
    const err = quiet();
    vi.mocked(sendOnce).mockRejectedValue(new Error("Discord answered 500"));
    await expect(announceOnce("waiting:u1", "hello")).resolves.toBeUndefined();
    expect(String(err.mock.calls[0]?.[0])).toContain("notification.announce_failed");
    expect(String(err.mock.calls[0]?.[0])).toContain("Discord answered 500");
  });
});
