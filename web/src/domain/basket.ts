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
 * Check a pick against the rules: 2-8 picks, where a pick is a coin or a waiting slot, with
 * at least one coin. Coins are different and each in the top 100 today (the ranking already
 * leaves out BTC, stablecoins and wrapped or staked tokens). Returns the problems, if any.
 */
export function checkBasket(ids: string[], eligible: EligibleCoin[], slots = 0): { errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(eligible.map((c) => [c.id, c]));
  const unique = new Set(ids);

  if (unique.size !== ids.length) errors.push("Each coin can be in the basket once.");
  if (unique.size < 1) errors.push("Pick at least one coin.");
  else if (unique.size + slots < RULES.basketMin) errors.push(`Pick at least ${RULES.basketMin} coins or slots.`);
  if (unique.size + slots > RULES.basketMax) errors.push(`Pick at most ${RULES.basketMax} coins and slots in all.`);
  for (const id of unique) {
    const coin = byId.get(id);
    if (id === BTC) errors.push("BTC is what you're measuring against, so it can't be in the basket.");
    else if (!coin) errors.push(`${id} isn't in today's top ${RULES.maxRank}.`);
    else if (coin.rank > RULES.maxRank)
      errors.push(`${coin.symbol} is ranked #${coin.rank}, outside the top ${RULES.maxRank}.`);
  }
  return { errors };
}
