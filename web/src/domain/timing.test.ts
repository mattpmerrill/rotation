import { describe, expect, it } from "vitest";
import { defined } from "@/lib/defined";
import { nextGoodStretch, nextGoodWindow, stanceAt, stretches, timingPoints, type BuyTimingData } from "./timing";

const data: BuyTimingData = {
  generated: "2026-09-26",
  entries: ["2016-07-10", "2016-07-24", "2020-05-17", "2020-05-31", "2018-12-01", "2022-10-20"],
  cycle: [2016, 2016, 2020, 2020, 2016, 2020],
  day: [1, 15, 6, 20, 875, 893],
  top10: [3, 2.8, 1.5, 1.6, 0.9, 0.5],
  coins: { solana: [null, null, 2, null, null, 1.1] },
};

describe("buy timing", () => {
  const points = timingPoints(data, "top10");

  it("keeps only buy days with a result", () => {
    expect(timingPoints(data, "solana").map((p) => p.day)).toEqual([6, 893]);
    expect(timingPoints(data, "nope")).toEqual([]);
  });

  it("calls a stretch good when every cycle beat BTC, poor when none did", () => {
    expect(stanceAt(points, 10).verdict).toBe("good");
    expect(stanceAt(points, 10).byCycle).toEqual([
      { cycle: 2016, btc: 2.9 },
      { cycle: 2020, btc: 1.55 },
    ]);
    expect(stanceAt(points, 890)).toMatchObject({ verdict: "poor", wins: 0, of: 2, median: 0.7 });
    expect(stanceAt(timingPoints(data, "solana"), 890).verdict).toBe("unknown"); // one cycle only
  });

  it("calls a stretch good when most cycles with data beat BTC, not only when all did", () => {
    const three = (btc: number[]) => btc.map((b, i) => ({ entry: String(i), cycle: 2016 + i * 4, day: 10, btc: b }));
    expect(stanceAt(three([2, 1.5, 0.8]), 10)).toMatchObject({ verdict: "good", wins: 2, of: 3 });
    expect(stanceAt(three([2, 0.8, 0.7]), 10)).toMatchObject({ verdict: "mixed", wins: 1, of: 3 });
    expect(stanceAt(three([0.9, 0.8, 0.7]), 10).verdict).toBe("poor");
  });

  it("splits the cycle into stretches", () => {
    const s = stretches(points, 90);
    expect(s[0]).toMatchObject({ from: 0, to: 89 });
    expect(s[0]?.stance.verdict).toBe("good");
    expect(s.at(-1)?.to).toBe(1455);
  });
});

describe("next good stretch", () => {
  it("finds the next stretch that beat BTC, wrapping into the next cycle", () => {
    const s = stretches(timingPoints(data, "top10"), 90);
    expect(nextGoodStretch(s, 890)).toMatchObject({ stretch: { from: 0 }, nextCycle: true });
    expect(nextGoodStretch(s, 10)).toMatchObject({ stretch: { from: 0 }, nextCycle: false });
    // two good stretches back to back merge into one run
    const run = nextGoodStretch([...s.slice(0, 1), { ...defined(s[0]), from: 90, to: 179 }, ...s.slice(2)], 890);
    expect(run?.stretch).toMatchObject({ from: 0, to: 179 });
  });
});

describe("next good window", () => {
  const s = stretches(timingPoints(data, "top10"), 90);
  const cycle = { lastHalving: "2024-04-20", nextHalvingEst: "2028-04-17" };

  it("dates a stretch in the current cycle from the last halving", () => {
    expect(nextGoodWindow(s, { ...cycle, daysSinceHalving: 10 })).toEqual({
      start: "2024-04-20",
      end: "2024-07-18",
      wins: 2,
      of: 2,
    });
  });

  it("dates a stretch in the next cycle from the estimated next halving", () => {
    expect(nextGoodWindow(s, { ...cycle, daysSinceHalving: 890 })).toMatchObject({ start: "2028-04-17" });
  });

  it("is null when no stretch beat BTC", () => {
    expect(nextGoodWindow([], { ...cycle, daysSinceHalving: 10 })).toBeNull();
  });
});
