import "server-only";
import { z } from "zod";
import type { BuyTimingData } from "@/domain/timing";
import timing from "../../public/data/buy-timing.json";

const results = z.array(z.number().nullable());

/** The shape the engine writes (`rotation buy-timing`), parsed when the server starts so a change
 *  on the Python side fails loudly instead of on a page. */
const schema = z.object({
  generated: z.string(),
  entries: z.array(z.string()),
  cycle: z.array(z.number()),
  day: z.array(z.number()),
  top10: results,
  coins: z.record(z.string(), results),
});

/** When buying alts has paid off, by buy day. */
export const buyTiming: BuyTimingData = schema.parse(timing);
