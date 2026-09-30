import { describe, expect, it } from "vitest";
import { buyIn, entry, prices, trade } from "./fixtures";
import { isChallengeComplete, isFinished, standingOf, startValueUsd } from "./standings";

describe("startValueUsd", () => {
  it("uses the price the buy-in sold BTC at", () => {
    expect(startValueUsd(entry, buyIn, 90_000)).toBe(100_000);
  });

  it("falls back to BTC's first close when no sale is dated on the start day", () => {
    const others = buyIn.filter((t) => t.asset !== "bitcoin");
    expect(startValueUsd(entry, others, 90_000)).toBe(90_000);
  });

  it("is zero when there is nothing to price it with", () => {
    expect(startValueUsd(entry, [], undefined)).toBe(0);
  });
});

describe("standingOf", () => {
  it("carries the start value and phase for the entry page", () => {
    const s = standingOf(entry, buyIn, prices, "2026-10-03");
    expect(s.startUsd).toBe(100_000);
    expect(s.phase).toBe("holding_alts");
    expect(isFinished(s)).toBe(false);
  });

  it("is finished once everything is back in BTC, and the challenge is complete when all are", () => {
    const sellAll = [
      trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 250, priceUsd: 400 }),
      trade({ tradedOn: "2026-10-02", asset: "chainlink", side: "sell", qty: 2500, priceUsd: 20 }),
      trade({ tradedOn: "2026-10-03", asset: "bitcoin", side: "buy", qty: 1.5, priceUsd: 100_000 }),
    ];
    const s = standingOf(entry, [...buyIn, ...sellAll], prices, "2026-10-03");
    expect(isFinished(s)).toBe(true);
    expect(isChallengeComplete([s])).toBe(true);
    expect(isChallengeComplete([])).toBe(false);
  });
});
