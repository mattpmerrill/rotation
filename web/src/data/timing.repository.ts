import "server-only";
import type { BuyTimingData } from "@/domain/timing";
import timing from "../../public/data/buy-timing.json";

/** When buying alts has paid off, by buy day (engine: `rotation buy-timing`). */
export const buyTiming = timing as BuyTimingData;
