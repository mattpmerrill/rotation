import { describe, expect, it } from "vitest";
import { priceOn, withLivePrices } from "./prices";
import type { PriceBook } from "./types";

const book: PriceBook = {
  bitcoin: { dates: ["2026-09-26", "2026-09-27"], closes: [84300, 84454] },
  solana: { dates: ["2026-09-26"], closes: [120] },
};

describe("withLivePrices", () => {
  it("appends a live close for today after yesterday's daily close", () => {
    const b = withLivePrices(book, { bitcoin: 83228 }, "2026-09-28");
    expect(b.bitcoin.dates).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
    expect(priceOn(b, "bitcoin", "2026-09-28")).toBe(83228);
    expect(priceOn(b, "bitcoin", "2026-09-27")).toBe(84454);
  });

  it("replaces today's close when the daily job already wrote one", () => {
    const b = withLivePrices(book, { bitcoin: 85000 }, "2026-09-27");
    expect(b.bitcoin.closes).toEqual([84300, 85000]);
  });

  it("adds coins the book doesn't have yet and leaves the rest alone", () => {
    const b = withLivePrices(book, { kaspa: 0.046 }, "2026-09-28");
    expect(b.kaspa).toEqual({ dates: ["2026-09-28"], closes: [0.046] });
    expect(b.solana).toBe(book.solana);
  });

  it("never rewrites the original book", () => {
    withLivePrices(book, { bitcoin: 1 }, "2026-09-28");
    expect(book.bitcoin.closes).toEqual([84300, 84454]);
  });
});
