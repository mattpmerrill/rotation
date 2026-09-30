import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentChallenge } from "@/data/challenges.repository";
import { deleteEntry, editEntry, findEntryFor, getEntry, startEntry } from "@/data/entries.repository";
import { getEligibleCoins } from "@/data/prices.repository";
import { listTrades } from "@/data/trades.repository";
import type { Viewer } from "@/data/viewer";
import type { EligibleCoin } from "@/domain/basket";
import { planBuyIn } from "@/domain/buy-in";
import { buyIn as savedBuyIn, entry, trade } from "@/domain/fixtures";
import type { Challenge } from "@/domain/types";
import { defined } from "@/lib/defined";
import { fail, ok } from "@/lib/result";
import { editableCoins } from "./editable-coins";
import type { BuyInInput } from "./schema";
import { deleteBasket, enterChallenge, redoBuyIn } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/data/challenges.repository", () => ({ getCurrentChallenge: vi.fn() }));
vi.mock("@/data/entries.repository", () => ({
  deleteEntry: vi.fn(),
  editEntry: vi.fn(),
  findEntryFor: vi.fn(),
  getEntry: vi.fn(),
  startEntry: vi.fn(),
}));
vi.mock("@/data/prices.repository", () => ({ getEligibleCoins: vi.fn() }));
vi.mock("@/data/trades.repository", () => ({ listTrades: vi.fn() }));
vi.mock("./editable-coins", () => ({ editableCoins: vi.fn() }));

const viewer: Viewer = { id: "u1", email: "alice@example.com", name: "Alice", isMember: true, isAdmin: false };
const challenge: Challenge = { id: 1, name: "1 Bitty Challenge", openedOn: "2026-10-01", closedOn: null };
const coins: EligibleCoin[] = [
  { id: "solana", symbol: "SOL", name: "Solana", rank: 4, image: null },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", rank: 12, image: null },
];

/** A valid buy-in: 1 BTC at $100k into SOL and LINK, dated within the challenge. */
const validInput = (over: Partial<BuyInInput> = {}): BuyInInput => ({
  startedOn: "2026-10-03",
  btcIn: 1,
  basket: ["solana", "chainlink"],
  slots: 0,
  trades: planBuyIn({
    btcIn: 1,
    btcPriceUsd: 100_000,
    coinPricesUsd: { solana: 200, chainlink: 20 },
    basket: ["solana", "chainlink"],
    slots: 0,
    feeRate: 0.01,
  }),
  ...over,
});

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? null : r.error?.code);
const messages = (r: { ok: boolean; error?: { fieldErrors?: Record<string, string[]> | undefined } }) =>
  r.ok ? [] : (r.error?.fieldErrors?.form ?? []);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  vi.mocked(getCurrentChallenge).mockResolvedValue(challenge);
  vi.mocked(findEntryFor).mockResolvedValue(null);
  vi.mocked(getEligibleCoins).mockResolvedValue({ coins, asOf: "2026-10-05" });
  vi.mocked(startEntry).mockResolvedValue(ok({ entryId: 9 }));
  vi.mocked(getEntry).mockResolvedValue(entry);
  vi.mocked(listTrades).mockResolvedValue(savedBuyIn);
  vi.mocked(editableCoins).mockResolvedValue(coins);
  vi.mocked(editEntry).mockResolvedValue(ok(null));
  vi.mocked(deleteEntry).mockResolvedValue(ok(null));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("enterChallenge", () => {
  it("saves a valid buy-in and returns the new entry's id", async () => {
    const input = validInput();
    expect(await enterChallenge(viewer, input)).toEqual(ok({ entryId: 9 }));
    expect(startEntry).toHaveBeenCalledWith("2026-10-03", 1, ["solana", "chainlink"], 0, input.trades);
  });

  it("refuses when no challenge is open or the current one has closed", async () => {
    vi.mocked(getCurrentChallenge).mockResolvedValue(null);
    expect(code(await enterChallenge(viewer, validInput()))).toBe("not_found");
    vi.mocked(getCurrentChallenge).mockResolvedValue({ ...challenge, closedOn: "2026-10-04" });
    expect(code(await enterChallenge(viewer, validInput()))).toBe("not_found");
    expect(startEntry).not.toHaveBeenCalled();
  });

  it("refuses a second entry in the same challenge", async () => {
    vi.mocked(findEntryFor).mockResolvedValue(entry);
    const result = await enterChallenge(viewer, validInput());
    expect(code(result)).toBe("conflict");
    expect(!result.ok && result.error.message).toBe("You're already in this challenge.");
    expect(startEntry).not.toHaveBeenCalled();
  });

  it("refuses a buy-in date before the challenge opened or in the future", async () => {
    for (const startedOn of ["2026-09-30", "2026-10-06"]) {
      const result = await enterChallenge(viewer, validInput({ startedOn }));
      expect(code(result)).toBe("rule_violation");
      expect(!result.ok && result.error.message).toBe("The buy-in date must be between 2026-10-01 and today.");
    }
    expect(startEntry).not.toHaveBeenCalled();
  });

  it("reports every problem at once when the basket and the buy-in both break rules", async () => {
    const input = validInput({ basket: ["solana", "dogecoin"] }); // dogecoin isn't in today's top 100
    const result = await enterChallenge(viewer, input);
    expect(code(result)).toBe("rule_violation");
    expect(messages(result).length).toBeGreaterThanOrEqual(2);
    expect(messages(result).join(" ")).toMatch(/dogecoin isn't in today's top 100/);
    expect(startEntry).not.toHaveBeenCalled();
  });

  it("refuses a buy-in that spends more than the sale raised", async () => {
    const [sale, ...buys] = validInput().trades;
    const greedy = [sale, ...buys.map((b) => ({ ...b, qty: b.qty * 2 }))].filter((t) => t !== undefined);
    const result = await enterChallenge(viewer, validInput({ trades: greedy }));
    expect(code(result)).toBe("rule_violation");
    expect(messages(result).join(" ")).toMatch(/more than the BTC sale raised/);
  });

  it("when the database refuses after the checks passed, says the clearest thing it can", async () => {
    vi.mocked(startEntry).mockResolvedValue(fail("conflict", "That already exists."));
    const raced = await enterChallenge(viewer, validInput());
    expect(!raced.ok && raced.error.message).toBe("You're already in this challenge.");
    vi.mocked(startEntry).mockResolvedValue(fail("not_found", "That wasn't found."));
    const closed = await enterChallenge(viewer, validInput());
    expect(!closed.ok && closed.error.message).toBe("No challenge is open right now.");
  });

  it("passes any other database failure through untouched", async () => {
    const failure = fail("unexpected", "Something went wrong on our side. Try again in a moment.");
    vi.mocked(startEntry).mockResolvedValue(failure);
    expect(await enterChallenge(viewer, validInput())).toEqual(failure);
  });
});

describe("redoBuyIn", () => {
  const onlyBuyIn = savedBuyIn; // nothing logged since the buy-in: still editable

  it("saves the new buy-in against the entry's own id, and returns it", async () => {
    const input = validInput();
    expect(await redoBuyIn(viewer, 1, input)).toEqual(ok({ entryId: 1 }));
    expect(editEntry).toHaveBeenCalledWith(1, "2026-10-03", 1, ["solana", "chainlink"], 0, input.trades);
  });

  it("refuses someone else's basket, or one that doesn't exist, before doing anything else", async () => {
    vi.mocked(getEntry).mockResolvedValue({ ...entry, userId: "someone-else" });
    expect(code(await redoBuyIn(viewer, 1, validInput()))).toBe("forbidden");
    vi.mocked(getEntry).mockResolvedValue(null);
    expect(code(await redoBuyIn(viewer, 1, validInput()))).toBe("forbidden");
    expect(listTrades).not.toHaveBeenCalled();
    expect(editEntry).not.toHaveBeenCalled();
  });

  it("is locked once anything but the buy-in has been logged", async () => {
    const sold = trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 10, priceUsd: 300 });
    vi.mocked(listTrades).mockResolvedValue([...onlyBuyIn, sold]);
    const result = await redoBuyIn(viewer, 1, validInput());
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toMatch(/it's locked/);
    expect(editEntry).not.toHaveBeenCalled();
  });

  it("refuses once the challenge has closed, or when the entry belongs to an older challenge", async () => {
    vi.mocked(getCurrentChallenge).mockResolvedValue({ ...challenge, closedOn: "2026-10-04" });
    expect(code(await redoBuyIn(viewer, 1, validInput()))).toBe("rule_violation");
    vi.mocked(getCurrentChallenge).mockResolvedValue({ ...challenge, id: 2 });
    const result = await redoBuyIn(viewer, 1, validInput());
    expect(!result.ok && result.error.message).toBe("This challenge has closed.");
  });

  it("keeps the current buy-in date reachable, but refuses one before the window", async () => {
    // entry started 2026-10-01 (the day the challenge opened): a date before it is refused
    const result = await redoBuyIn(viewer, 1, validInput({ startedOn: "2026-09-29" }));
    expect(code(result)).toBe("rule_violation");
    expect(!result.ok && result.error.message).toBe("The buy-in date must be between 2026-10-01 and today.");
    expect(code(await redoBuyIn(viewer, 1, validInput({ startedOn: "2026-10-06" })))).toBe("rule_violation");
  });

  it("checks the basket against the coins an edit may hold, and lists every problem", async () => {
    vi.mocked(editableCoins).mockResolvedValue([defined(coins[0])]); // chainlink no longer allowed
    const result = await redoBuyIn(viewer, 1, validInput());
    expect(code(result)).toBe("rule_violation");
    expect(messages(result).join(" ")).toMatch(/chainlink isn't in today's top 100/);
    expect(editEntry).not.toHaveBeenCalled();
  });

  it("passes a database failure through", async () => {
    const failure = fail("unexpected", "Something went wrong on our side. Try again in a moment.");
    vi.mocked(editEntry).mockResolvedValue(failure);
    expect(await redoBuyIn(viewer, 1, validInput())).toEqual(failure);
  });
});

describe("deleteBasket", () => {
  it("deletes the viewer's own basket by the entry's id", async () => {
    expect(await deleteBasket(viewer, 1)).toEqual(ok(null));
    expect(deleteEntry).toHaveBeenCalledWith(1);
  });

  it("refuses someone else's basket or a missing one, and deletes nothing", async () => {
    vi.mocked(getEntry).mockResolvedValue({ ...entry, userId: "someone-else" });
    const result = await deleteBasket(viewer, 1);
    expect(code(result)).toBe("forbidden");
    expect(!result.ok && result.error.message).toBe("You can only delete your own basket.");
    vi.mocked(getEntry).mockResolvedValue(null);
    expect(code(await deleteBasket(viewer, 1))).toBe("forbidden");
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("passes a database failure through", async () => {
    const failure = fail("unexpected", "Something went wrong on our side. Try again in a moment.");
    vi.mocked(deleteEntry).mockResolvedValue(failure);
    expect(await deleteBasket(viewer, 1)).toEqual(failure);
  });
});
