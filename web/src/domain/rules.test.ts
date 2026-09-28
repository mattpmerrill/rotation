import { describe, expect, it } from "vitest";
import { defined } from "@/lib/defined";
import { checkBasket, type EligibleCoin } from "./basket";
import { checkBuyIn, planBuyIn, usdtAfter } from "./buyIn";
import { coinChanges } from "./coins";
import { cycleReference } from "./cycle";
import { buyIn, entry, prices } from "./fixtures";
import { rankStandings, standingOf } from "./standings";

const eligible: EligibleCoin[] = [
  { id: "solana", symbol: "SOL", name: "Solana", rank: 4, image: null },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", rank: 12, image: null },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", rank: 8, image: null },
  { id: "far", symbol: "FAR", name: "Far", rank: 140, image: null },
];

describe("checkBasket", () => {
  it("accepts 2-8 different top-100 coins", () => {
    expect(checkBasket(["solana", "chainlink"], eligible).errors).toEqual([]);
  });
  it("rejects too few, duplicates, BTC, and coins outside the top 100", () => {
    expect(checkBasket(["solana"], eligible).errors).toHaveLength(1);
    expect(checkBasket(["solana", "solana"], eligible).errors.length).toBeGreaterThan(0);
    expect(checkBasket(["solana", "bitcoin"], eligible).errors[0]).toMatch(/BTC/);
    expect(checkBasket(["solana", "far"], eligible).errors[0]).toMatch(/#140/);
    expect(checkBasket(["solana", "unknown"], eligible).errors[0]).toMatch(/top 100/);
  });
});

describe("planBuyIn", () => {
  const input = {
    btcIn: 1,
    btcPriceUsd: 100_000,
    coinPricesUsd: { solana: 200, chainlink: 20 },
    basket: ["solana", "chainlink"],
    slots: 0,
    feeRate: 0.01,
  };

  it("sells the BTC and spends the proceeds equally, fees included, leaving nothing", () => {
    const t = planBuyIn(input);
    const buy = defined(t[1]);
    expect(t[0]).toEqual({ asset: "bitcoin", side: "sell", qty: 1, priceUsd: 100_000, feeUsd: 1000 });
    expect(buy.qty * buy.priceUsd + buy.feeUsd).toBeCloseTo(49_500, 6);
    expect(usdtAfter(t)).toBeCloseTo(0, 6);
    expect(checkBuyIn(1, input.basket, 0, t)).toEqual([]);
  });

  it("refuses to plan a coin it has no price for", () => {
    expect(() => planBuyIn({ ...input, coinPricesUsd: { solana: 200 } })).toThrow(/no price for chainlink/);
  });

  it("flags a buy-in over 1 BTC, a coin outside the basket, and overspending", () => {
    const t = planBuyIn({ ...input, btcIn: 1.5 });
    expect(checkBuyIn(1.5, input.basket, 0, t)[0]).toMatch(/at most 1 BTC/);
    const outside = planBuyIn({
      ...input,
      basket: ["solana", "dogecoin"],
      coinPricesUsd: { solana: 200, dogecoin: 0.2 },
    });
    expect(checkBuyIn(1, input.basket, 0, outside).join()).toMatch(/only buys coins in your basket/);
    const over = planBuyIn(input).map((x) => (x.asset === "solana" ? { ...x, qty: x.qty * 2 } : x));
    expect(checkBuyIn(1, input.basket, 0, over).join()).toMatch(/more than the BTC sale raised/);
  });
});

describe("coinChanges", () => {
  it("measures each coin against its buy-in price, in USD and against BTC", () => {
    const changes = coinChanges(entry, buyIn, prices, "2026-10-03");
    const sol = defined(changes[0]);
    const link = defined(changes[1]);
    expect(sol.asset).toBe("solana");
    expect(sol.changeUsd).toBe(1); // $200 -> $400
    expect(sol.changeBtc).toBeCloseTo(0.6); // x2 in USD while BTC x1.25
    expect(link.changeBtc).toBeCloseTo(-0.2);
    expect(sol.status).toBe("held");
  });
});

describe("standings", () => {
  it("ranks by BTC multiple and tracks the best and worst days", () => {
    const s = standingOf(entry, buyIn, prices, "2026-10-03");
    expect(s.multiple).toBe(1.2);
    expect([s.best, s.worst]).toEqual([1.5, 1]);
    const other = { ...s, multiple: 1.3, entry: { ...entry, playerName: "Braav" } };
    expect(rankStandings([s, other]).map((x) => x.entry.playerName)).toEqual(["Braav", "Wrenny"]);
  });
});

describe("cycleReference", () => {
  it("counts days since the last halving and estimates the next one", () => {
    const r = cycleReference(["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-19"], 1456, [500, 580], "2026-09-26");
    expect(r.daysSinceHalving).toBe(890);
    expect(r.nextHalvingEst.slice(0, 7)).toBe("2028-04");
    expect(r.sellWindow[0] > "2029-08").toBe(true);
  });
});
