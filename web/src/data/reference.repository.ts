import reference from "@/generated/market-reference.json";

/** Reference numbers from config/rules.yaml, exported by the engine (`rotation web-data`). */
export interface MarketReference {
  halvings: string[];
  halvingIntervalDays: number;
  sellWindowDays: [number, number];
  rebuy: { daysSinceHigh: number; drawdown: number; mvrvBelow: number };
}

export const marketReference: MarketReference = {
  halvings: reference.halvings,
  halvingIntervalDays: reference.halving_interval_days,
  sellWindowDays: reference.sell_window_days as [number, number],
  rebuy: {
    daysSinceHigh: reference.rebuy.days_since_high,
    drawdown: reference.rebuy.drawdown,
    mvrvBelow: reference.rebuy.mvrv_below,
  },
};
