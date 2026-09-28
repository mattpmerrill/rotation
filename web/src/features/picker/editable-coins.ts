import "server-only";
import { getCoins, getEligibleCoins } from "@/data/prices";
import type { EligibleCoin } from "@/domain/basket";

/** Coins an edited basket can hold: today's top 100, plus the coins already in it (a coin that
 *  has since dropped out of the top 100 can stay). */
export async function editableCoins(basket: string[]): Promise<EligibleCoin[]> {
  const { coins } = await getEligibleCoins();
  const missing = basket.filter((id) => !coins.some((c) => c.id === id));
  if (!missing.length) return coins;
  const extra = await getCoins(missing);
  return [
    ...coins,
    ...missing.map((id) => ({
      id,
      symbol: extra[id]?.symbol ?? id,
      name: extra[id]?.name ?? id,
      image: extra[id]?.image ?? null,
      rank: 0, // already held: allowed whatever its rank today
    })),
  ];
}
