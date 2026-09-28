import { describe, expect, it } from "vitest";
import { check, variablesListed, variablesRead } from "./env-example.mjs";

describe("env-example guard", () => {
  it("finds the variables read and the variables listed", () => {
    expect(variablesRead("a: process.env.FOO_BAR, b: process.env.BAZ || undefined, c: process.env.FOO_BAR")).toEqual([
      "BAZ",
      "FOO_BAR",
    ]);
    expect(variablesListed("# note\nFOO_BAR=\n# BAZ=\n  QUX_1=value\nlower=x")).toEqual(["BAZ", "FOO_BAR", "QUX_1"]);
  });

  it("passes when the two agree", () => {
    expect(check(["A", "B"], ["A", "B"])).toEqual([]);
  });

  it("names a variable that is read but not listed, and one listed but not read", () => {
    expect(check(["A", "B"], ["A", "C"])).toEqual([
      "read by env.ts but missing from .env.example: B",
      "listed in .env.example but never read: C",
    ]);
  });
});
