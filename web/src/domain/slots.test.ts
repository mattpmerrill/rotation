import { describe, expect, it } from "vitest";
import { defined } from "@/lib/defined";
import { checkBasket, type EligibleCoin } from "./basket";
import { btcSoldAtBuyIn, checkBuyIn, planBuyIn, usdtAfter } from "./buyIn";
import { entry, trade } from "./fixtures";
import { planFill, slotShare, slotsClosedReason, waitingBtc } from "./slots";

const coins: EligibleCoin[] = [
  { id: "solana", symbol: "SOL", name: "Solana", rank: 4, image: null },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", rank: 12, image: null },
];
// 2 coins + 2 slots: half the BTC is sold at the buy-in, half waits
const slotted = { ...entry, openSlots: 2 };
const buyIn = [
  trade({ tradedOn: "2026-10-01", asset: "bitcoin", side: "sell", qty: 0.5, priceUsd: 100_000 }),
  trade({ tradedOn: "2026-10-01", asset: "solana", side: "buy", qty: 125, priceUsd: 200 }),
  trade({ tradedOn: "2026-10-01", asset: "chainlink", side: "buy", qty: 1250, priceUsd: 20 }),
];

describe("waiting slots", () => {
  it("count as picks: one coin and one slot is a basket, slots don't push past 8", () => {
    expect(checkBasket(["solana"], coins, 1).errors).toEqual([]);
    expect(checkBasket([], coins, 2).errors[0]).toMatch(/at least one coin/);
    expect(checkBasket(["solana", "chainlink"], coins, 7).errors[0]).toMatch(/at most 8/);
  });

  it("keep their share of the BTC at the buy-in", () => {
    expect(btcSoldAtBuyIn(1, 2, 2)).toBe(0.5);
    const t = planBuyIn({
      btcIn: 1,
      btcPriceUsd: 100_000,
      coinPricesUsd: { solana: 200, chainlink: 20 },
      basket: ["solana", "chainlink"],
      slots: 2,
      feeRate: 0.01,
    });
    expect(t[0]?.qty).toBe(0.5);
    expect(usdtAfter(t)).toBeCloseTo(0, 6);
    expect(checkBuyIn(1, ["solana", "chainlink"], 2, t)).toEqual([]);
    expect(checkBuyIn(1, ["solana", "chainlink"], 0, t)[0]).toMatch(/exactly the BTC/);
  });

  it("split the waiting BTC equally, and a fill spends one share", () => {
    expect(waitingBtc(slotted, buyIn)).toBe(0.5);
    expect(slotShare(slotted, buyIn)).toBe(0.25);
    const fill = planFill(0.25, 100_000, "sui", 2, 0.01);
    const sale = defined(fill[0]);
    const buy = defined(fill[1]);
    expect(sale).toMatchObject({ asset: "bitcoin", side: "sell", qty: 0.25, feeUsd: 250 });
    expect(buy.qty * buy.priceUsd + buy.feeUsd).toBeCloseTo(24_750, 6);
    expect(usdtAfter([sale, buy])).toBeCloseTo(0, 6);
  });

  it("close once rebuying starts", () => {
    expect(slotsClosedReason(slotted, buyIn)).toBeNull();
    const rebuy = trade({ tradedOn: "2026-11-01", asset: "bitcoin", side: "buy", qty: 0.01, priceUsd: 100_000 });
    expect(slotsClosedReason(slotted, [...buyIn, rebuy])).toMatch(/rebuying/);
    expect(waitingBtc(slotted, [...buyIn, rebuy])).toBe(0);
    expect(slotsClosedReason({ ...slotted, openSlots: 0 }, buyIn)).toMatch(/No waiting slots/);
  });
});
