import { afterEach, describe, expect, it, vi } from "vitest";
import { postToDiscord } from "./discord";
import { announceOnce } from "./notifications";

vi.mock("server-only", () => ({}));
vi.mock("./discord", () => ({ postToDiscord: vi.fn() }));

// The table calls announceOnce makes through the admin client: claim (upsert) and release (delete).
const table = { claim: vi.fn(), release: vi.fn() };
vi.mock("./supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      upsert: () => ({ select: () => table.claim() }),
      delete: () => ({ eq: () => table.release() }),
    }),
  }),
}));

const claimed = { data: [{ key: "k" }], error: null };
const alreadyClaimed = { data: [], error: null };

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function quiet() {
  vi.spyOn(console, "log").mockImplementation(() => {});
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("announceOnce", () => {
  it("posts the first time, and not again once the key is claimed", async () => {
    quiet();
    table.claim.mockResolvedValueOnce(claimed).mockResolvedValueOnce(alreadyClaimed);
    vi.mocked(postToDiscord).mockResolvedValue(true);
    await announceOnce("waiting:u1", "hello");
    await announceOnce("waiting:u1", "hello");
    expect(postToDiscord).toHaveBeenCalledTimes(1);
    expect(postToDiscord).toHaveBeenCalledWith("hello");
  });

  it("releases the key when no webhook is set, so it is posted once one is", async () => {
    quiet();
    table.claim.mockResolvedValue(claimed);
    table.release.mockResolvedValue({});
    vi.mocked(postToDiscord).mockResolvedValue(false);
    await announceOnce("waiting:u1", "hello");
    expect(table.release).toHaveBeenCalledTimes(1);
  });

  it("never throws: a Discord failure releases the key and is logged as an error", async () => {
    const err = quiet();
    table.claim.mockResolvedValue(claimed);
    table.release.mockResolvedValue({});
    vi.mocked(postToDiscord).mockRejectedValue(new Error("Discord answered 500"));
    await expect(announceOnce("waiting:u1", "hello")).resolves.toBeUndefined();
    expect(table.release).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toContain("notification.announce_failed");
    expect(String(err.mock.calls[0]?.[0])).toContain("Discord answered 500");
  });

  it("never throws when the database is unavailable either", async () => {
    const err = quiet();
    table.claim.mockResolvedValue({ data: null, error: new Error("connection refused") });
    await expect(announceOnce("waiting:u1", "hello")).resolves.toBeUndefined();
    expect(postToDiscord).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
  });
});
