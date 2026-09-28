import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEntry } from "@/data/entries";
import { getCoins, getEligibleCoins } from "@/data/prices";
import { addTrade, deleteTrade, fillSlot, listTrades } from "@/data/trades";
import type { Viewer } from "@/data/viewer";
import { buyIn, entry, trade } from "@/domain/fixtures";
import { planFill } from "@/domain/slots";
import { fail, ok } from "@/lib/result";
import { fillSlotWithCoin, recordTrade, retractTrade } from "./service";
import type { FillInput, TradeInput } from "./schema";

vi.mock("server-only", () => ({}));
vi.mock("@/data/entries", () => ({ getEntry: vi.fn() }));
vi.mock("@/data/prices", () => ({ getCoins: vi.fn(), getEligibleCoins: vi.fn() }));
vi.mock("@/data/trades", () => ({ addTrade: vi.fn(), deleteTrade: vi.fn(), fillSlot: vi.fn(), listTrades: vi.fn() }));

const viewer: Viewer = { id: "u1", email: "alice@example.com", name: "Alice", isMember: true, isAdmin: false };
const coinsById = { solana: { id: "solana", symbol: "SOL", name: "Solana", image: null } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  vi.mocked(getEntry).mockResolvedValue(entry);
  vi.mocked(listTrades).mockResolvedValue(buyIn);
  vi.mocked(getCoins).mockResolvedValue(coinsById);
  vi.mocked(addTrade).mockResolvedValue(ok(null));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

const sell = (over: Partial<TradeInput> = {}): TradeInput => ({
  entryId: 1,
  kind: "sell_alt",
  asset: "solana",
  tradedOn: "2026-10-03",
  qty: 100,
  priceUsd: 300,
  feeUsd: 0,
  note: null,
  ...over,
});

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);

describe("recordTrade", () => {
  it("saves a sell of a coin in the basket as a 'sell' trade", async () => {
    const result = await recordTrade(viewer, sell());
    expect(result).toEqual(ok(null));
    expect(addTrade).toHaveBeenCalledWith(1, {
      asset: "solana",
      side: "sell",
      qty: 100,
      priceUsd: 300,
      feeUsd: 0,
      kind: "sell",
      tradedOn: "2026-10-03",
      note: null,
    });
  });

  it("saves a rebuy of BTC as a 'rebuy' trade once there is USDT to spend", async () => {
    const soldSol = trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 250, priceUsd: 400 });
    vi.mocked(listTrades).mockResolvedValue([...buyIn, soldSol]); // $100,000 USDT
    const result = await recordTrade(viewer, sell({ kind: "buy_btc", asset: "bitcoin", qty: 0.5, priceUsd: 100_000 }));
    expect(result.ok).toBe(true);
    expect(addTrade).toHaveBeenCalledWith(1, expect.objectContaining({ asset: "bitcoin", side: "buy", kind: "rebuy" }));
  });

  it("refuses, and writes nothing, for someone else's basket or one that doesn't exist", async () => {
    vi.mocked(getEntry).mockResolvedValue({ ...entry, userId: "someone-else" });
    expect(code(await recordTrade(viewer, sell()))).toBe("forbidden");
    vi.mocked(getEntry).mockResolvedValue(null);
    expect(code(await recordTrade(viewer, sell()))).toBe("forbidden");
    expect(addTrade).not.toHaveBeenCalled();
  });

  it("refuses to sell a coin that isn't in the basket", async () => {
    const result = await recordTrade(viewer, sell({ asset: "dogecoin" }));
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toBe("Pick a coin from your basket.");
    expect(addTrade).not.toHaveBeenCalled();
  });

  it("refuses a date before the buy-in or after today", async () => {
    for (const tradedOn of ["2026-09-30", "2026-10-06"]) {
      const result = await recordTrade(viewer, sell({ tradedOn }));
      expect(code(result)).toBe("rule_violation");
      expect(!result.ok && result.error.message).toMatch(/between your buy-in and today/);
    }
    expect(addTrade).not.toHaveBeenCalled();
  });

  it("refuses to sell more than is held, saying how much is", async () => {
    const result = await recordTrade(viewer, sell({ qty: 251 })); // the buy-in bought 250 SOL
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toMatch(/You hold 250 SOL/);
    expect(addTrade).not.toHaveBeenCalled();
  });

  it("refuses a rebuy that costs more USDT than is held", async () => {
    const result = await recordTrade(viewer, sell({ kind: "buy_btc", asset: "bitcoin", qty: 1, priceUsd: 100_000 }));
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toMatch(/That costs/);
  });

  it("returns the repository's failure as it is, so a database refusal keeps its code", async () => {
    vi.mocked(addTrade).mockResolvedValue(
      fail("unexpected", "Something went wrong on our side. Try again in a moment."),
    );
    expect(code(await recordTrade(viewer, sell()))).toBe("unexpected");
  });
});

describe("retractTrade", () => {
  it("succeeds when a trade was deleted", async () => {
    vi.mocked(deleteTrade).mockResolvedValue(ok({ deleted: true }));
    expect(await retractTrade(7)).toEqual(ok(null));
    expect(deleteTrade).toHaveBeenCalledWith(7);
  });

  it("says it isn't yours when nothing was deleted (someone else's, a buy-in, or already gone)", async () => {
    vi.mocked(deleteTrade).mockResolvedValue(ok({ deleted: false }));
    const result = await retractTrade(7);
    expect(code(result)).toBe("forbidden");
    expect(!result.ok && result.error.message).toBe("That trade isn't yours to delete.");
  });

  it("passes a repository failure through", async () => {
    vi.mocked(deleteTrade).mockResolvedValue(
      fail("unexpected", "Something went wrong on our side. Try again in a moment."),
    );
    expect(code(await retractTrade(7))).toBe("unexpected");
  });
});

describe("fillSlotWithCoin", () => {
  // two coins and two waiting slots: half the BTC waits, so one slot's share is 0.25 BTC
  const slotted = { ...entry, openSlots: 2 };
  const slotBuyIn = [
    trade({ tradedOn: "2026-10-01", asset: "bitcoin", side: "sell", qty: 0.5, priceUsd: 100_000 }),
    trade({ tradedOn: "2026-10-01", asset: "solana", side: "buy", qty: 125, priceUsd: 200 }),
    trade({ tradedOn: "2026-10-01", asset: "chainlink", side: "buy", qty: 1250, priceUsd: 20 }),
  ];
  const sui = { id: "sui", symbol: "SUI", name: "Sui", rank: 9, image: null };
  const planned = planFill(0.25, 100_000, "sui", 2, 0.01);
  const fill = (over: Partial<FillInput> = {}): FillInput => ({
    entryId: 1,
    coin: "sui",
    tradedOn: "2026-10-03",
    btcPriceUsd: 100_000,
    coinPriceUsd: 2,
    coinQty: planned[1]?.qty ?? 0,
    feeRate: 0.01,
    ...over,
  });

  beforeEach(() => {
    vi.mocked(getEntry).mockResolvedValue(slotted);
    vi.mocked(listTrades).mockResolvedValue(slotBuyIn);
    vi.mocked(getEligibleCoins).mockResolvedValue({ coins: [sui], asOf: "2026-10-05" });
    vi.mocked(fillSlot).mockResolvedValue(ok(null));
  });

  it("sells exactly one slot's share of BTC and buys the coin", async () => {
    expect(await fillSlotWithCoin(viewer, fill())).toEqual(ok(null));
    const [entryId, tradedOn, coin, trades] = vi.mocked(fillSlot).mock.calls[0] ?? [];
    expect([entryId, tradedOn, coin]).toEqual([1, "2026-10-03", "sui"]);
    expect(trades?.[0]).toMatchObject({ asset: "bitcoin", side: "sell", qty: 0.25 });
    expect(trades?.[1]).toMatchObject({ asset: "sui", side: "buy" });
  });

  it("refuses someone else's basket", async () => {
    vi.mocked(getEntry).mockResolvedValue({ ...slotted, userId: "someone-else" });
    expect(code(await fillSlotWithCoin(viewer, fill()))).toBe("forbidden");
    expect(fillSlot).not.toHaveBeenCalled();
  });

  it("refuses once rebuying has started, or when no slot is left", async () => {
    const rebuy = trade({ tradedOn: "2026-10-02", asset: "bitcoin", side: "buy", qty: 0.01, priceUsd: 100_000 });
    vi.mocked(listTrades).mockResolvedValue([...slotBuyIn, rebuy]);
    expect(code(await fillSlotWithCoin(viewer, fill()))).toBe("rule_violation");
    vi.mocked(listTrades).mockResolvedValue(slotBuyIn);
    vi.mocked(getEntry).mockResolvedValue({ ...slotted, openSlots: 0 });
    expect(code(await fillSlotWithCoin(viewer, fill()))).toBe("rule_violation");
    expect(fillSlot).not.toHaveBeenCalled();
  });

  it("refuses a coin already in the basket, or outside today's top 100", async () => {
    expect(code(await fillSlotWithCoin(viewer, fill({ coin: "solana" })))).toBe("rule_violation");
    vi.mocked(getEligibleCoins).mockResolvedValue({ coins: [], asOf: "2026-10-05" });
    const result = await fillSlotWithCoin(viewer, fill());
    expect(!result.ok && result.error.message).toBe("Pick a coin from today's top 100.");
    expect(fillSlot).not.toHaveBeenCalled();
  });

  it("refuses a date outside the entry", async () => {
    expect(code(await fillSlotWithCoin(viewer, fill({ tradedOn: "2026-09-30" })))).toBe("rule_violation");
    expect(code(await fillSlotWithCoin(viewer, fill({ tradedOn: "2026-10-06" })))).toBe("rule_violation");
  });

  it("refuses to buy more of the coin than one slot's BTC pays for", async () => {
    const result = await fillSlotWithCoin(viewer, fill({ coinQty: (planned[1]?.qty ?? 0) * 2 }));
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toMatch(/more of the coin than one slot/);
    expect(fillSlot).not.toHaveBeenCalled();
  });
});
