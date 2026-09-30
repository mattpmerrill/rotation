import { z } from "zod";
import { cycleReference, type CycleReference } from "@/domain/cycle";
import type { Day } from "@/domain/types";
import reference from "@/generated/market-reference.json";

/** Reference numbers from config/rules.yaml, exported by the engine (`rotation web-data`). */
export interface MarketReference {
  halvings: string[];
  halvingIntervalDays: number;
  sellWindowDays: [number, number];
  rebuy: { daysSinceHigh: number; drawdown: number; mvrvBelow: number };
}

/** The shape the engine writes, parsed when the server starts. */
const schema = z.object({
  halvings: z.array(z.string()),
  halving_interval_days: z.number(),
  sell_window_days: z.tuple([z.number(), z.number()]),
  rebuy: z.object({ days_since_high: z.number(), drawdown: z.number(), mvrv_below: z.number() }),
});

const parsed = schema.parse(reference);

export const marketReference: MarketReference = {
  halvings: parsed.halvings,
  halvingIntervalDays: parsed.halving_interval_days,
  sellWindowDays: parsed.sell_window_days,
  rebuy: {
    daysSinceHigh: parsed.rebuy.days_since_high,
    drawdown: parsed.rebuy.drawdown,
    mvrvBelow: parsed.rebuy.mvrv_below,
  },
};

/** Where `today` falls on the halving clock. */
export function cycleOn(today: Day): CycleReference {
  return cycleReference(
    marketReference.halvings,
    marketReference.halvingIntervalDays,
    marketReference.sellWindowDays,
    today,
  );
}
