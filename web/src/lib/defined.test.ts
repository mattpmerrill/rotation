import { describe, expect, it } from "vitest";
import { defined } from "./defined";

describe("defined", () => {
  it("returns a value that is there, including zero and empty string", () => {
    expect(defined(0)).toBe(0);
    expect(defined("")).toBe("");
    expect(defined([1][0])).toBe(1);
  });

  it("throws, naming what was missing, for null and undefined", () => {
    expect(() => defined(undefined, "the first trade")).toThrow("Expected the first trade to be defined");
    expect(() => defined(null)).toThrow("Expected value to be defined");
  });
});
