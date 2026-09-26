import { describe, expect, it } from "vitest";
import { buyIn, entry, prices } from "@/domain/fixtures";
import { standingOf } from "@/domain/standings";
import { buyInMessage, digestMessage, rebuyWindowMessage, tradeMessage } from "./messages";

const coins = {
  solana: { id: "solana", symbol: "SOL", name: "Solana", image: null },
  chainlink: { id: "chainlink", symbol: "LINK", name: "Chainlink", image: null },
};

describe("Discord messages", () => {
  it("say who did what, never how much", () => {
    const msgs = [
      buyInMessage(entry, coins),
      tradeMessage(entry, { ...buyIn[1], side: "sell", kind: "sell" }, coins),
      digestMessage("1 Bitty Challenge", [standingOf(entry, buyIn, prices, "2026-10-03")], "https://app/"),
    ];
    expect(msgs[0]).toBe("**Wrenny** is in: SOL, LINK.");
    expect(msgs[1]).toBe("**Wrenny** sold SOL.");
    expect(tradeMessage(entry, { ...buyIn[1], kind: "fill" }, coins)).toBe(
      "**Wrenny** filled a waiting slot with SOL.",
    );
    expect(msgs[2]).toContain("1. Wrenny: 1.20× (+20%)");
    for (const m of msgs) expect(m).not.toMatch(/\$|BTC\b(?! →)/);
  });

  it("explains the rebuy window", () => {
    expect(rebuyWindowMessage(365, 0.62)).toMatch(/365 days past its high and 62% below it/);
  });
});
