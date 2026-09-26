"use client";

import { useState } from "react";
import { checkBasket, type EligibleCoin } from "@/domain/basket";
import { RULES } from "@/domain/rules";
import type { Coin, PriceBook } from "@/domain/types";
import { buttonClass } from "@/ui/Button";
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
  initialBasket = [],
  btcIcon,
}: {
  btcIcon: string | null;
  /** Coins to start with, e.g. from "Try this basket" on Joi's top picks. */
  initialBasket?: string[];
  coins: EligibleCoin[];
  daysSinceHalving: number;
  sellWindowDays: [number, number];
  window: [string, string];
  prices: PriceBook;
}) {
  const [basket, setBasket] = useState<string[]>(() =>
    initialBasket.filter((id) => coins.some((c) => c.id === id)).slice(0, RULES.basketMax),
  );
  const toggle = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const symbols = Object.fromEntries(coins.map((c) => [c.id, c.symbol]));
  const [slots, setSlots] = useState(0);
  const slotIds = Array.from({ length: slots }, (_, i) => `slot-${i + 1}`);
  const byId: Record<string, Coin> = {
    ...Object.fromEntries(coins.map((c) => [c.id, c])),
    // waiting slots show in the preview as BTC held the whole time
    ...Object.fromEntries(
      slotIds.map((id) => [id, { id, symbol: "Waiting BTC", name: "Waiting slot", image: btcIcon }]),
    ),
  };
  const picks = basket.length + slots;
  const check = checkBasket(basket, coins, slots);
  const ready = check.errors.length === 0;

  return (
    <div className="grid gap-10">
      <Section
        title="Choose your coins"
        action={
          <span className="text-ink-3 text-sm">
            {picks} of {RULES.basketMin}–{RULES.basketMax} picks
          </span>
        }
      >
        {picks > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Your basket">
            {basket.map((id) => (
              <button key={id} type="button" onClick={() => toggle(id)} aria-label={`Remove ${symbols[id]}`}>
                <CoinTag symbol={`${symbols[id]} ✕`} image={byId[id]?.image} />
              </button>
            ))}
            {slotIds.map((id) => (
              <button key={id} type="button" onClick={() => setSlots((n) => n - 1)} aria-label="Remove a waiting slot">
                <CoinTag symbol="Waiting BTC ✕" image={btcIcon} dashed />
              </button>
            ))}
          </div>
        )}
        <div className="border-btc/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
          <p className="text-ink-2 max-w-xl text-sm">
            <span className="text-ink font-semibold">Waiting slots</span> keep their share of your BTC as BTC. Fill one
            later with any top-100 coin, even one that launches after you start, up until you begin rebuying.
          </p>
          <button
            type="button"
            onClick={() => setSlots((n) => n + 1)}
            disabled={picks >= RULES.basketMax}
            className={buttonClass("quiet")}
          >
            Add a waiting slot
          </button>
        </div>
        <CoinPicker coins={coins} selected={basket} onToggle={toggle} max={RULES.basketMax - slots} />
        {basket.length > 0 && !ready && <p className="text-ink-3 text-sm">{check.errors[0]}</p>}
      </Section>

      {picks > 0 && (
        <Section title="How it did in past cycles" panel>
          <PreviewPanel
            basket={[...basket, ...slotIds]}
            coins={byId}
            daysSinceHalving={daysSinceHalving}
            sellWindowDays={sellWindowDays}
          />
        </Section>
      )}

      {ready && (
        <Section title="Buy in" panel>
          <BuyInForm basket={basket} slots={slots} symbols={symbols} prices={prices} window={window} />
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
