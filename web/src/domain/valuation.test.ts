import { defined } from "@/lib/defined";
import { describe, expect, it } from "vitest";
import { buyIn, entry, prices, trade } from "./fixtures";
import { balancesOn, phaseOf } from "./holdings";
import { priceOn } from "./prices";
import { multiple, valueOn, valueSeries } from "./valuation";

describe("priceOn", () => {
  it("uses the day's close, else the last one before it", () => {
    expect(priceOn(prices, "chainlink", "2026-10-02")).toBe(20);
    expect(priceOn(prices, "chainlink", "2026-10-09")).toBe(20);
  });
  it("is null before the first price or for an unknown coin", () => {
    expect(priceOn(prices, "solana", "2026-09-30")).toBeNull();
    expect(priceOn(prices, "nope", "2026-10-02")).toBeNull();
  });
});

describe("balances and phase", () => {
  it("opens with the BTC put in; the buy-in moves it into the basket", () => {
    const b = balancesOn(entry, buyIn);
    expect(b).toMatchObject({ bitcoin: 0, usdt: 0, solana: 250, chainlink: 2500 });
    expect(phaseOf(b, buyIn)).toBe("holding_alts");
  });

  it("takes fees out of USDT", () => {
    const sell = trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 100, priceUsd: 400, feeUsd: 400 });
    expect(balancesOn(entry, [...buyIn, sell]).usdt).toBe(39_600);
  });

  it("holds USDT once the alts are sold, and is back in BTC after the rebuy", () => {
    const sold = [
      ...buyIn,
      trade({ tradedOn: "2026-10-02", asset: "solana", side: "sell", qty: 250, priceUsd: 400 }),
      trade({ tradedOn: "2026-10-02", asset: "chainlink", side: "sell", qty: 2500, priceUsd: 20 }),
    ];
    expect(phaseOf(balancesOn(entry, sold), sold)).toBe("holding_usdt");

    const half = [
      ...sold,
      trade({ tradedOn: "2026-10-03", asset: "bitcoin", side: "buy", qty: 0.6, priceUsd: 125_000 }),
    ];
    expect(phaseOf(balancesOn(entry, half), half)).toBe("holding_usdt");

    const all = [
      ...sold,
      trade({ tradedOn: "2026-10-03", asset: "bitcoin", side: "buy", qty: 1.2, priceUsd: 125_000 }),
    ];
    expect(balancesOn(entry, all).usdt).toBe(0);
    expect(phaseOf(balancesOn(entry, all), all)).toBe("back_in_btc");
  });
});

describe("valuation", () => {
  it("is 1 BTC at the buy-in", () => {
    const p = defined(valueOn(entry, buyIn, prices, "2026-10-01"));
    expect(p.totalUsd).toBe(100_000);
    expect(p.totalBtc).toBe(1);
  });

  it("prices every holding in BTC", () => {
    // SOL doubled: 250 x 400 + 2,500 x 20 = $150k at BTC $100k
    const p = defined(valueOn(entry, buyIn, prices, "2026-10-02"));
    expect(p.totalBtc).toBe(1.5);
    expect(multiple(entry, p)).toBe(1.5);
  });

  it("carries a coin's last price forward and falls with a BTC rally", () => {
    // BTC +25% while the alts hold: $150k / $125k
    expect(defined(valueOn(entry, buyIn, prices, "2026-10-03")).totalBtc).toBe(1.2);
  });

  it("gives one point per priced day from the buy-in", () => {
    expect(valueSeries(entry, buyIn, prices, "2026-10-03").map((p) => p.day)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(valueSeries(entry, buyIn, prices, "2026-09-30")).toEqual([]);
  });

  it("scores against the BTC put in, not against 1", () => {
    const half = { ...entry, btcIn: 0.5 };
    const halfTrades = buyIn.map((t) => ({ ...t, qty: t.qty / 2 }));
    expect(multiple(half, defined(valueOn(half, halfTrades, prices, "2026-10-02")))).toBe(1.5);
  });
});
