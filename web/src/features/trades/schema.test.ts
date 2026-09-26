import { describe, expect, it } from "vitest";
import { tradeInput } from "./schema";

const valid = {
  entryId: "3",
  kind: "sell_alt",
  asset: "solana",
  tradedOn: "2027-05-01",
  qty: "10",
  priceUsd: "250",
  feeUsd: "25",
  note: " top? ",
};

describe("tradeInput", () => {
  it("parses a form submission", () => {
    expect(tradeInput.parse(valid)).toEqual({ ...valid, entryId: 3, qty: 10, priceUsd: 250, feeUsd: 25, note: "top?" });
  });
  it("rejects zero amounts, bad dates and unknown kinds", () => {
    expect(tradeInput.safeParse({ ...valid, qty: "0" }).success).toBe(false);
    expect(tradeInput.safeParse({ ...valid, tradedOn: "2027-02-30" }).success).toBe(false);
    expect(tradeInput.safeParse({ ...valid, kind: "buy_alt" }).success).toBe(false);
  });
  it("stores an empty note as none", () => {
    expect(tradeInput.parse({ ...valid, note: "  " }).note).toBeNull();
  });
});
