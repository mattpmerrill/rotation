import { describe, expect, it } from "vitest";
import { integerParam } from "./integer-param";

describe("integerParam", () => {
  it("reads a whole number", () => {
    expect(integerParam("12")).toBe(12);
  });

  it("returns null for anything else", () => {
    for (const raw of ["1.5", "abc", "12abc", "NaN", "Infinity"]) expect(integerParam(raw), raw).toBeNull();
  });
});
