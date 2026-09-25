import { COINS, COINS_AS_OF } from "./cycle";

type Supa = Awaited<ReturnType<typeof import("./supabase/server").createClient>>;
export type RankedCoin = { id: string; symbol: string; name: string; rank: number };

/** Today's ranks from the daily job (top 200, backtest definition), falling back to the
 *  snapshot shipped with the app if the job hasn't run yet. */
export async function liveRanks(supabase: Supa): Promise<{ coins: RankedCoin[]; asOf: string; live: boolean }> {
  const { data: latest } = await supabase
    .from("daily_prices")
    .select("date")
    .eq("source", "coingecko_live")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { coins: COINS, asOf: COINS_AS_OF, live: false };
  const { data: rows } = await supabase
    .from("daily_prices")
    .select("coin_id, rank, coins(symbol, name)")
    .eq("date", latest.date)
    .not("rank", "is", null)
    .order("rank")
    .limit(200);
  if (!rows?.length) return { coins: COINS, asOf: COINS_AS_OF, live: false };
  const coins = rows.map((r) => {
    const c = (Array.isArray(r.coins) ? r.coins[0] : r.coins) as { symbol: string; name: string } | null;
    return { id: r.coin_id as string, rank: r.rank as number, symbol: (c?.symbol ?? r.coin_id).toUpperCase(), name: c?.name ?? r.coin_id };
  });
  return { coins, asOf: latest.date as string, live: true };
}
