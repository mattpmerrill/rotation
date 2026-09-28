import "server-only";
import type { MarketState } from "@/domain/types";
import { supabaseServer, type Db } from "./supabase/server";

/** The latest market state the daily job wrote, or null before its first run. */
export async function getMarketState(db?: Db): Promise<MarketState | null> {
  db ??= await supabaseServer();
  const { data } = await db.from("market_state").select("*").order("day", { ascending: false }).limit(1).maybeSingle();
  return (
    data && {
      day: data.day,
      btcPrice: data.btc_price,
      ath: data.ath,
      athDate: data.ath_date,
      drawdown: data.drawdown,
      daysSinceAth: data.days_since_ath,
      mvrv: data.mvrv,
      rebuyWindowOpen: data.rebuy_window_open,
    }
  );
}
