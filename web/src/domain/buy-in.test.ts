import { describe, expect, it } from "vitest";
import { buyInFeeRate, draftBuyIn, planBuyIn, type BuyInDraftInput } from "./buy-in";
import { buyIn, prices } from "./fixtures";

describe("buyInFeeRate", () => {
  it("reads the fee rate off the BTC sale", () => {
    const sale = { asset: "bitcoin", side: "sell" as const, qty: 1, priceUsd: 100_000, feeUsd: 1_000 };
    expect(buyInFeeRate([sale])).toBeCloseTo(0.01);
  });

  it("is undefined without a BTC sale, or when the sale was worth nothing", () => {
    expect(buyInFeeRate([])).toBeUndefined();
    expect(buyInFeeRate([{ asset: "solana", side: "buy", qty: 1, priceUsd: 200, feeUsd: 2 }])).toBeUndefined();
    expect(buyInFeeRate([{ asset: "bitcoin", side: "sell", qty: 0, priceUsd: 100_000, feeUsd: 0 }])).toBeUndefined();
  });

  it("recovers the rate a planned buy-in was made with", () => {
    const plan = planBuyIn({
      btcIn: 1,
      btcPriceUsd: 100_000,
      coinPricesUsd: { solana: 200, chainlink: 20 },
      basket: ["solana", "chainlink"],
      slots: 0,
      feeRate: 0.0125,
    });
    expect(buyInFeeRate(plan)).toBeCloseTo(0.0125);
  });
});

describe("draftBuyIn", () => {
  const input: BuyInDraftInput = {
    btcIn: 1,
    basket: ["solana", "chainlink"],
    slots: 0,
    feeRate: 0.01,
    prices,
    day: "2026-10-01",
    overrides: {},
  };

  it("plans equal dollar amounts at the day's closes", () => {
    const trades = draftBuyIn(input);
    expect(trades.map((t) => t.asset)).toEqual(["bitcoin", "solana", "chainlink"]);
    expect(trades[0]).toMatchObject({ side: "sell", qty: 1, priceUsd: 100_000 });
    expect(trades[1]?.priceUsd).toBe(200);
    expect(trades[2]?.priceUsd).toBe(20);
  });

  it("applies a typed price and amount, and the fee follows the edited amount", () => {
    const trades = draftBuyIn({ ...input, overrides: { solana: { qty: "100", price: "250" } } });
    const sol = trades.find((t) => t.asset === "solana");
    expect(sol).toMatchObject({ qty: 100, priceUsd: 250 });
    expect(sol?.feeUsd).toBeCloseTo(100 * 250 * 0.01);
  });

  it("returns nothing while it cannot be planned", () => {
    expect(draftBuyIn({ ...input, day: "2026-09-01" })).toEqual([]); // no price that day
    expect(draftBuyIn({ ...input, basket: ["solana", "unknown"] })).toEqual([]);
    expect(draftBuyIn({ ...input, btcIn: 0 })).toEqual([]);
    expect(draftBuyIn({ ...input, feeRate: Number.NaN })).toEqual([]);
  });

  it("agrees with the fixture buy-in when nothing is edited", () => {
    const trades = draftBuyIn({ ...input, feeRate: 0 });
    expect(trades.map((t) => [t.asset, Math.round(t.qty * 1e6) / 1e6])).toEqual(buyIn.map((t) => [t.asset, t.qty]));
  });
});
