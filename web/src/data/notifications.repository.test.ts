import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOnce } from "./notifications.repository";

vi.mock("server-only", () => ({}));

// The table calls sendOnce makes through the admin client: claim (upsert) and release (delete).
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
  vi.resetAllMocks();
});

describe("sendOnce", () => {
  it("sends the first time, and not again once the key is claimed", async () => {
    const send = vi.fn().mockResolvedValue(true);
    table.claim.mockResolvedValueOnce(claimed).mockResolvedValueOnce(alreadyClaimed);
    expect(await sendOnce("waiting:u1", send)).toBe(true);
    expect(await sendOnce("waiting:u1", send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("releases the key when nothing was sent, so it is sent once there is somewhere to send it", async () => {
    table.claim.mockResolvedValue(claimed);
    table.release.mockResolvedValue({});
    expect(await sendOnce("waiting:u1", async () => false)).toBe(false);
    expect(table.release).toHaveBeenCalledTimes(1);
  });

  it("releases the key and rethrows when sending fails", async () => {
    table.claim.mockResolvedValue(claimed);
    table.release.mockResolvedValue({});
    await expect(
      sendOnce("waiting:u1", async () => {
        throw new Error("Discord answered 500");
      }),
    ).rejects.toThrow("Discord answered 500");
    expect(table.release).toHaveBeenCalledTimes(1);
  });

  it("throws, and sends nothing, when the database is unavailable", async () => {
    const send = vi.fn();
    table.claim.mockResolvedValue({ data: null, error: new Error("connection refused") });
    await expect(sendOnce("waiting:u1", send)).rejects.toThrow("connection refused");
    expect(send).not.toHaveBeenCalled();
  });
});
