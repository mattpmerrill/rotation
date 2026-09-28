import { revalidatePath } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireMember, type Viewer } from "@/data/viewer";
import { fail, ok } from "@/lib/result";
import { fillWaitingSlot, logTrade, removeTrade } from "./actions";
import { fillSlotWithCoin, recordTrade, retractTrade } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data/viewer", () => ({ requireMember: vi.fn() }));
vi.mock("./service", () => ({ recordTrade: vi.fn(), retractTrade: vi.fn(), fillSlotWithCoin: vi.fn() }));

const viewer: Viewer = { id: "u1", email: "a@example.com", name: "A", isMember: true };
const data = (fields: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

const validTrade = {
  entryId: "1",
  kind: "sell_alt",
  asset: "solana",
  tradedOn: "2026-10-03",
  qty: "10",
  priceUsd: "300",
  feeUsd: "0",
  note: "",
};

afterEach(() => vi.resetAllMocks());

describe("the trade actions", () => {
  it("authenticate first: a non-member never reaches validation or the service", async () => {
    vi.mocked(requireMember).mockRejectedValue(new Error("Only challenge members can do that."));
    await expect(logTrade({}, data(validTrade))).rejects.toThrow("Only challenge members");
    await expect(removeTrade(1)).rejects.toThrow("Only challenge members");
    await expect(fillWaitingSlot({}, data({}))).rejects.toThrow("Only challenge members");
    expect(recordTrade).not.toHaveBeenCalled();
    expect(retractTrade).not.toHaveBeenCalled();
    expect(fillSlotWithCoin).not.toHaveBeenCalled();
  });

  it("logTrade validates the form, and shows the first problem without calling the service", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    const state = await logTrade({}, data({ ...validTrade, qty: "0" }));
    expect(state).toEqual({ error: "Enter an amount above zero." });
    expect(recordTrade).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("logTrade passes the viewer and the parsed input to the service, and revalidates on success", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    vi.mocked(recordTrade).mockResolvedValue(ok(null));
    const state = await logTrade({}, data(validTrade));
    expect(state.saved).toEqual(expect.any(Number));
    expect(recordTrade).toHaveBeenCalledWith(viewer, expect.objectContaining({ entryId: 1, qty: 10, note: null }));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("logTrade shows the service's message on a failure and does not revalidate", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    vi.mocked(recordTrade).mockResolvedValue(fail("rule_violation", "Pick a coin from your basket."));
    expect(await logTrade({}, data(validTrade))).toEqual({ error: "Pick a coin from your basket." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("removeTrade treats its argument as untrusted: a non-integer, negative or non-number id is refused", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    for (const bad of [1.5, -3, 0, "7", null, undefined, NaN] as unknown as number[]) {
      const result = await removeTrade(bad);
      expect(result.error, String(bad)).toBeTruthy();
    }
    expect(retractTrade).not.toHaveBeenCalled();
  });

  it("removeTrade deletes through the service and revalidates only on success", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    vi.mocked(retractTrade).mockResolvedValue(ok(null));
    expect(await removeTrade(7)).toEqual({});
    expect(retractTrade).toHaveBeenCalledWith(7);
    expect(revalidatePath).toHaveBeenCalledTimes(1);

    vi.mocked(retractTrade).mockResolvedValue(fail("forbidden", "That trade isn't yours to delete."));
    expect(await removeTrade(8)).toEqual({ error: "That trade isn't yours to delete." });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("fillWaitingSlot validates, calls the service, and reports its result", async () => {
    vi.mocked(requireMember).mockResolvedValue(viewer);
    expect((await fillWaitingSlot({}, data({ entryId: "1", coin: "" }))).error).toBe("Pick a coin.");
    expect(fillSlotWithCoin).not.toHaveBeenCalled();

    vi.mocked(fillSlotWithCoin).mockResolvedValue(ok(null));
    const state = await fillWaitingSlot(
      {},
      data({
        entryId: "1",
        coin: "sui",
        tradedOn: "2026-10-03",
        btcPriceUsd: "100000",
        coinPriceUsd: "2",
        coinQty: "10",
        feeRate: "0.01",
      }),
    );
    expect(state.saved).toEqual(expect.any(Number));
    expect(fillSlotWithCoin).toHaveBeenCalledWith(viewer, expect.objectContaining({ coin: "sui", coinQty: 10 }));
  });
});
