import "server-only";
import type { BasketHistory } from "@/domain/preview";
import history from "../../public/data/basket-history.json";

/** The past-cycle price history (engine: `rotation web-data`), for server-side previews.
 *  The browser loads the same file from /data/basket-history.json. */
export const basketHistory = history as BasketHistory;
