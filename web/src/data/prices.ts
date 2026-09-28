import "server-only";
import type { EligibleCoin } from "@/domain/basket";
import { RULES } from "@/domain/rules";
import type { Coin, PriceBook } from "@/domain/types";
import { supabaseServer, type Db } from "./supabase/server";

/** Daily closes for `assets` from `from` on, one request however long the range. */
export async function getPriceBook(assets: string[], from: string, db?: Db): Promise<PriceBook> {
  if (!assets.length) return {};
  db ??= await supabaseServer();
  const { data, error } = await db.rpc("price_series", { p_coins: [...new Set(assets)], p_from: from });
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.coin_id, { dates: r.dates, closes: r.closes }]));
}

export async function getCoins(ids: string[], db?: Db): Promise<Record<string, Coin>> {
  if (!ids.length) return {};
  db ??= await supabaseServer();
  const { data, error } = await db
    .from("coins")
    .select("id, symbol, name, image_url")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return Object.fromEntries(
    data.map((c) => [c.id, { id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, image: smallIcon(c.image_url) }]),
  );
}

/** Today's top-100 alts from the daily job's live ranks (BTC, stablecoins and wrapped tokens
 *  don't take a rank), with the day they're from. Empty if the job hasn't run. */
export async function getEligibleCoins(): Promise<{ coins: EligibleCoin[]; asOf: string | null }> {
  const db = await supabaseServer();
  const { data: latest } = await db
    .from("daily_prices")
    .select("date")
    .eq("source", "coingecko_live")
    .not("rank", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { coins: [], asOf: null };
  const { data, error } = await db
    .from("daily_prices")
    .select("coin_id, rank, coins(symbol, name, image_url)")
    .eq("date", latest.date)
    .lte("rank", RULES.maxRank)
    .order("rank");
  if (error) throw error;
  return {
    asOf: latest.date,
    coins: data.flatMap((r) =>
      r.rank === null
        ? []
        : [
            {
              id: r.coin_id,
              rank: r.rank,
              symbol: (r.coins?.symbol ?? r.coin_id).toUpperCase(),
              name: r.coins?.name ?? r.coin_id,
              image: smallIcon(r.coins?.image_url ?? null),
            },
          ],
    ),
  };
}

/** CoinGecko's 50px icon instead of the 250px one: the app shows icons at 20-32px. */
function smallIcon(url: string | null): string | null {
  return url ? url.replace("/large/", "/small/") : null;
}
