import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The engine writes these files; importing each repository parses the committed file against the
// web app's schema, so a change on the Python side that the web app does not know about fails here.
describe("the files the engine writes", () => {
  it("basket-history.json has the shape the picker preview reads", async () => {
    const { basketHistory } = await import("./history.repository");
    expect(basketHistory.cycles.length).toBeGreaterThan(0);
    for (const c of basketHistory.cycles) expect(c.btc_usd).toHaveLength(c.weeks.length);
  });

  it("buy-timing.json has parallel arrays, one value per buy day", async () => {
    const { buyTiming } = await import("./timing.repository");
    const n = buyTiming.entries.length;
    expect(n).toBeGreaterThan(0);
    expect([buyTiming.cycle.length, buyTiming.day.length, buyTiming.top10.length]).toEqual([n, n, n]);
    for (const series of Object.values(buyTiming.coins)) expect(series).toHaveLength(n);
  });

  it("market-reference.json has the halvings and the rebuy rule", async () => {
    const { marketReference } = await import("./reference.repository");
    expect(marketReference.halvings.length).toBeGreaterThan(1);
    expect(marketReference.sellWindowDays[0]).toBeLessThan(marketReference.sellWindowDays[1]);
    expect(marketReference.rebuy.drawdown).toBeGreaterThan(0);
  });
});
