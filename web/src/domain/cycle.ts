import { defined } from "@/lib/defined";
import { addDays, daysBetween } from "@/lib/days";
import type { Day } from "./types";

/** Reference dates from the halving clock. The challenge has no schedule: people choose when
 *  to buy and sell. These are the dates the earlier research pointed to, shown as context. */
export interface CycleReference {
  lastHalving: Day;
  daysSinceHalving: number;
  /** Estimated: the last halving plus the engine's fixed interval (rotation/signal.py). */
  nextHalvingEst: Day;
  /** The old sell window, measured from the next halving. */
  sellWindow: [Day, Day];
}

export function cycleReference(
  halvings: Day[],
  intervalDays: number,
  sellWindowDays: [number, number],
  today: Day,
): CycleReference {
  const last = defined(
    halvings
      .filter((h) => h <= today)
      .sort()
      .at(-1),
    "a halving on or before today",
  );
  const next = addDays(last, intervalDays);
  return {
    lastHalving: last,
    daysSinceHalving: daysBetween(last, today),
    nextHalvingEst: next,
    sellWindow: [addDays(next, sellWindowDays[0]), addDays(next, sellWindowDays[1])],
  };
}
