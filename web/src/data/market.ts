import "server-only";
import { supabaseServer, type Db } from "./supabase/server";

export interface MarketState {
  day: string;
  btcPrice: number;
  ath: number;
  athDate: string;
  drawdown: number;
  daysSinceAth: number;
  mvrv: number | null;
  rebuyWindowOpen: boolean;
}

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
