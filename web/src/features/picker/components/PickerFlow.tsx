"use client";

import { useState } from "react";
import { checkBasket, type EligibleCoin } from "@/domain/basket";
import { RULES } from "@/domain/rules";
import type { PriceBook } from "@/domain/types";
import { CoinTag } from "@/ui/CoinTag";
import { Notice } from "@/ui/Notice";
import { Section } from "@/ui/Section";
import { BuyInForm } from "./BuyInForm";
import { CoinPicker } from "./CoinPicker";
import { PreviewPanel } from "./PreviewPanel";

/** Pick the coins, see how they’d have done, then buy in. */
export function PickerFlow({
  coins,
  daysSinceHalving,
  sellWindowDays,
  window,
  prices,
}: {
  coins: EligibleCoin[];
  daysSinceHalving: number;
  sellWindowDays: [number, number];
  window: [string, string];
  prices: PriceBook;
}) {
  const [basket, setBasket] = useState<string[]>([]);
  const toggle = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const symbols = Object.fromEntries(coins.map((c) => [c.id, c.symbol]));
  const check = checkBasket(basket, coins);
  const ready = check.errors.length === 0;

  return (
    <div className="grid gap-10">
      <Section
        title="Choose your coins"
        action={
          <span className="text-ink-3 text-sm">
            {basket.length} of {RULES.basketMin}–{RULES.basketMax}
          </span>
        }
      >
        {basket.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Your basket">
            {basket.map((id) => (
              <button key={id} type="button" onClick={() => toggle(id)} aria-label={`Remove ${symbols[id]}`}>
                <CoinTag symbol={`${symbols[id]} ✕`} />
              </button>
            ))}
          </div>
        )}
        <CoinPicker coins={coins} selected={basket} onToggle={toggle} />
        {basket.length > 0 && !ready && <p className="text-ink-3 text-sm">{check.errors[0]}</p>}
      </Section>

      {basket.length > 0 && (
        <Section title="How it did in past cycles" panel>
          <PreviewPanel basket={basket} daysSinceHalving={daysSinceHalving} sellWindowDays={sellWindowDays} />
        </Section>
      )}

      {ready && (
        <Section title="Buy in" panel>
          <BuyInForm basket={basket} symbols={symbols} prices={prices} window={window} />
        </Section>
      )}

      {coins.length === 0 && (
        <Notice tone="error">
          Today’s coin ranks haven’t loaded yet. The daily job fills them in; check back soon.
        </Notice>
      )}
    </div>
  );
}
