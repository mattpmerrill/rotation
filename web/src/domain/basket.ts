import { RULES } from "./rules";
import { BTC } from "./types";

/** A coin the picker can offer: ranked among non-stablecoin, non-wrapped alts. */
export interface EligibleCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number;
}

/**
 * Check a pick against the rules: 2-8 different coins, each in the top 100 today (the
 * ranking already leaves out BTC, stablecoins and wrapped or staked tokens). Returns the
 * problems, if any.
 */
export function checkBasket(ids: string[], eligible: EligibleCoin[]): { errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(eligible.map((c) => [c.id, c]));
  const unique = new Set(ids);

  if (unique.size !== ids.length) errors.push("Each coin can be in the basket once.");
  if (unique.size < RULES.basketMin) errors.push(`Pick at least ${RULES.basketMin} coins.`);
  if (unique.size > RULES.basketMax) errors.push(`Pick at most ${RULES.basketMax} coins.`);
  for (const id of unique) {
    if (id === BTC) errors.push("BTC is what you're measuring against, so it can't be in the basket.");
    else if (!byId.has(id)) errors.push(`${id} isn't in today's top ${RULES.maxRank}.`);
    else if (byId.get(id)!.rank > RULES.maxRank)
      errors.push(`${byId.get(id)!.symbol} is ranked #${byId.get(id)!.rank}, outside the top ${RULES.maxRank}.`);
  }
  return { errors };
}
