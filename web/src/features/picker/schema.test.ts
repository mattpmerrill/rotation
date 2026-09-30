import { describe, expect, it } from "vitest";
import { parseBasketParam } from "./schema";

describe("parseBasketParam", () => {
  it("splits comma-separated coin ids and drops empty ones", () => {
    expect(parseBasketParam("solana,chainlink")).toEqual(["solana", "chainlink"]);
    expect(parseBasketParam("solana,,chainlink,")).toEqual(["solana", "chainlink"]);
  });

  it("gives an empty basket when the parameter is missing, empty or not a string", () => {
    expect(parseBasketParam(undefined)).toEqual([]);
    expect(parseBasketParam("")).toEqual([]);
    expect(parseBasketParam(["solana", "chainlink"])).toEqual([]); // ?basket=a&basket=b
  });
});
