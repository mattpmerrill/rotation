import { describe, expect, it } from "vitest";
import { buyIn, entry, trade } from "@/domain/fixtures";
import { toBuyInEdit } from "./buy-in-edit";

describe("toBuyInEdit", () => {
  it("starts the form from the logged buy-in: amounts and prices as text, by asset", () => {
    const edit = toBuyInEdit(entry, buyIn);
    expect(edit).toMatchObject({ entryId: entry.id, btcIn: 1, startedOn: "2026-10-01" });
    expect(edit.overrides.solana).toEqual({ qty: "250", price: "200" });
    expect(edit.overrides.bitcoin).toEqual({ qty: "1", price: "100000" });
  });

  it("uses the fee rate the buy-in was made with", () => {
    const withFee = buyIn.map((t) => (t.asset === "bitcoin" ? { ...t, feeUsd: 500 } : t));
    expect(toBuyInEdit(entry, withFee).feeRate).toBeCloseTo(0.005);
  });

  it("falls back to the default fee rate when the buy-in has no BTC sale", () => {
    const alts = [trade({ tradedOn: "2026-10-01", asset: "solana", side: "buy", qty: 1, priceUsd: 200 })];
    expect(toBuyInEdit(entry, alts).feeRate).toBe(0.01);
  });
});
