import { describe, expect, it } from "vitest";
import { buyIn, entry, trade } from "./fixtures";
import { balancesOn } from "./holdings";
import { checkTrade, isBuyInTrade } from "./trades";

describe("trades", () => {
  it("recognizes the buy-in's trades", () => {
    expect(buyIn.every((t) => isBuyInTrade(entry, t))).toBe(true);
    const later = trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 1, priceUsd: 400 });
    expect(isBuyInTrade(entry, later)).toBe(false);
  });

  it("explains an oversell or an overspend", () => {
    const b = balancesOn(entry, buyIn);
    expect(checkTrade(b, { asset: "solana", side: "sell", qty: 250, priceUsd: 1, feeUsd: 0 }, "SOL")).toBeNull();
    expect(checkTrade(b, { asset: "solana", side: "sell", qty: 251, priceUsd: 1, feeUsd: 0 }, "SOL")).toMatch(
      /hold 250 SOL/,
    );
    expect(checkTrade(b, { asset: "bitcoin", side: "buy", qty: 0.1, priceUsd: 100_000, feeUsd: 0 }, "BTC")).toMatch(
      /you hold \$0.00/,
    );
  });
});
