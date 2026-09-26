import { describe, expect, it } from "vitest";
import { previewBasket, type BasketHistory } from "./preview";

// One cycle, halving 2020-01-05, next 2021-01-03; weekly Sundays from 2020-01-05.
const weeks = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2020, 0, 5 + 7 * i)).toISOString().slice(0, 10));
const history: BasketHistory = {
  generated: "2026-09-26",
  ranks_as_of: "2026-09-22",
  coins: { aaa: { symbol: "AAA", name: "A" }, bbb: { symbol: "BBB", name: "B" }, ccc: { symbol: "CCC", name: "C" } },
  cycles: [
    {
      halving: "2020-01-05",
      next_halving: "2021-01-03",
      weeks,
      btc_usd: weeks.map(() => 10_000),
      coins: {
        aaa: weeks.map((_, i) => 1000 * (1 + i / 10)), // rises steadily against BTC
        bbb: weeks.map(() => 1000), // flat against BTC
        ccc: weeks.map((_, i) => (i < 20 ? null : 1000)), // didn't exist until week 20
      },
    },
  ],
};

describe("previewBasket", () => {
  it("averages the coins from the matching week, after the buy-in fee", () => {
    const [c] = previewBasket(history, ["aaa", "bbb"], 70, [7, 14], 0.01); // day 70 = week 10
    expect(c.entryWeek).toBe("2020-03-15");
    expect(c.points[0].btc).toBeCloseTo(0.99);
    // week 11: aaa 2.1/2.0, bbb 1 -> 1.025 before fees
    expect(c.points[1].btc).toBeCloseTo(1.025 * 0.99);
    expect(c.low).toBeCloseTo(0.99);
    expect(c.peak.week).toBe(weeks.at(-1));
  });

  it("values the old sell window with both fees paid", () => {
    // next halving 2021-01-03 + 7..14 days = the weeks of 2021-01-10 and 2021-01-17
    const [c] = previewBasket(history, ["bbb", "bbb"], 70, [7, 14], 0.01);
    expect(c.sellWindow).toEqual(["2021-01-10", "2021-01-17"]);
    expect(c.sellWindowWeeks).toEqual(["2021-01-10", "2021-01-17"]);
    expect(c.atSellWindow).toBeCloseTo(0.99 * 0.99);
  });

  it("buys a coin that didn't exist yet at its first price, holding its share as BTC until then", () => {
    // ccc starts at week 20 and stays flat; entry at week 10
    const [c] = previewBasket(history, ["aaa", "ccc"], 70, [7, 14], 0);
    const ccc = c.coins.find((x) => x.id === "ccc")!;
    expect(ccc.boughtLate).toBe(weeks[20]);
    expect(ccc.neverListed).toBe(false);
    expect(ccc.atSellWindow).toBeCloseTo(1);
    // week 10: aaa 1, ccc waiting as BTC 1 -> 1
    expect(c.points[0].btc).toBeCloseTo(1);
    const [later] = previewBasket(history, ["aaa", "ccc"], 150, [7, 14], 0);
    expect(later.coins.find((x) => x.id === "ccc")!.boughtLate).toBeNull();
  });

  it("counts a coin that stops trading as worth nothing, and one never listed as BTC", () => {
    const dead = {
      ...history,
      cycles: [
        {
          ...history.cycles[0],
          coins: { ...history.cycles[0].coins, ddd: weeks.map((_, i) => (i < 12 ? 1000 : null)) },
        },
      ],
    };
    const [c] = previewBasket(dead, ["ddd", "zzz"], 70, [7, 14], 0);
    expect(c.coins[0].atSellWindow).toBe(0);
    expect(c.coins[1].neverListed).toBe(true);
    expect(c.coins[1].atSellWindow).toBe(1);
  });
});
