import { describe, expect, it } from "vitest";
import { formatBtc, formatChange, formatDay, formatPrice, formatUsd } from "./format";

describe("format", () => {
  it("formats amounts people read", () => {
    expect(formatBtc(1.18342)).toBe("1.1834 BTC");
    expect(formatUsd(99_231.4)).toBe("$99,231");
    expect(formatPrice(0.00001234)).toBe("$0.00001234");
    expect(formatChange(0.18)).toBe("+18%");
    expect(formatChange(-0.052)).toBe("−5.2%");
    expect(formatDay("2026-09-26")).toBe("Sep 26, 2026");
  });
});

describe("formatChange", () => {
  it("shows rounding noise as flat", () => {
    expect(formatChange(-0.00001)).toBe("0%");
  });
});
