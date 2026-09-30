import "server-only";
import { z } from "zod";
import type { BasketHistory } from "@/domain/preview";
import history from "../../public/data/basket-history.json";

const prices = z.array(z.number().nullable());

/** The shape the engine writes (`rotation web-data`). The file is parsed when the server starts, so
 *  a change on the Python side that the web app doesn't know about fails loudly, not on a page. */
const schema = z.object({
  generated: z.string(),
  ranks_as_of: z.string(),
  coins: z.record(z.string(), z.object({ symbol: z.string(), name: z.string() })),
  cycles: z.array(
    z.object({
      halving: z.string(),
      next_halving: z.string(),
      weeks: z.array(z.string()),
      btc_usd: prices,
      coins: z.record(z.string(), prices),
    }),
  ),
});

/** The past-cycle price history, for server-side previews. The browser loads the same file from
 *  /data/basket-history.json. */
export const basketHistory: BasketHistory = schema.parse(history);
