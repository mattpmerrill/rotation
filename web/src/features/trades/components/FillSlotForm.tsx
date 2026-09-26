"use client";

import { useActionState, useState } from "react";
import type { EligibleCoin } from "@/domain/basket";
import { priceOn } from "@/domain/prices";
import { RULES } from "@/domain/rules";
import { planFill } from "@/domain/slots";
import { BTC, type PriceBook } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { formatBtc, formatUsd } from "@/lib/format";
import { Button } from "@/ui/Button";
import { CoinIcon } from "@/ui/CoinIcon";
import { Field } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { fillWaitingSlot, type TradeFormState } from "../actions";

/**
 * Fill a waiting slot: choose a coin from today's top 100; one slot's share of the waiting BTC
 * buys it. Prices fill in from that day's close; change them to what you actually got.
 */
export function FillSlotForm({
  entryId,
  share,
  coins,
  prices,
  from,
}: {
  entryId: number;
  share: number;
  coins: EligibleCoin[];
  prices: PriceBook;
  from: string;
}) {
  const [state, action, pending] = useActionState(fillWaitingSlot, {} as TradeFormState);
  const [coin, setCoin] = useState(coins[0]?.id ?? "");
  const [day, setDay] = useState(todayUtc());
  const [typed, setTyped] = useState<{ btc?: string; coin?: string; qty?: string }>({});

  const btcPrice = typed.btc ?? String(priceOn(prices, BTC, day) ?? "");
  const coinPrice = typed.coin ?? String(priceOn(prices, coin, day) ?? "");
  const planned =
    Number(btcPrice) > 0 && Number(coinPrice) > 0
      ? planFill(share, Number(btcPrice), coin, Number(coinPrice), RULES.defaultFeeRate)[1].qty
      : 0;
  const qty = typed.qty ?? (planned ? String(Number(planned.toPrecision(8))) : "");
  const chosen = coins.find((c) => c.id === coin);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="feeRate" value={RULES.defaultFeeRate} />
      <p className="text-ink-2 text-sm">
        One slot’s share is <span className="text-ink font-semibold">{formatBtc(share)}</span>. It’s sold for the coin
        you pick (1% fee each way).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="coin-fill" className="text-ink-2 text-sm font-medium">
            Coin (today’s top 100)
          </label>
          <div className="flex items-center gap-2">
            {chosen && <CoinIcon symbol={chosen.symbol} image={chosen.image} size={28} />}
            <select
              id="coin-fill"
              name="coin"
              className="field"
              value={coin}
              onChange={(e) => {
                setCoin(e.target.value);
                setTyped((t) => ({ btc: t.btc }));
              }}
            >
              {coins.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.rank} {c.symbol}: {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Field
          id="fill-day"
          name="tradedOn"
          type="date"
          label="Date"
          min={from}
          max={todayUtc()}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setTyped({});
          }}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="fill-btc-price"
          name="btcPriceUsd"
          label="BTC price (USD)"
          inputMode="decimal"
          value={btcPrice}
          onChange={(e) => setTyped((t) => ({ ...t, btc: e.target.value, qty: undefined }))}
          required
        />
        <Field
          id="fill-coin-price"
          name="coinPriceUsd"
          label={`${chosen?.symbol ?? "Coin"} price (USD)`}
          inputMode="decimal"
          value={coinPrice}
          onChange={(e) => setTyped((t) => ({ ...t, coin: e.target.value, qty: undefined }))}
          required
        />
        <Field
          id="fill-qty"
          name="coinQty"
          label={`${chosen?.symbol ?? "Coin"} bought`}
          inputMode="decimal"
          value={qty}
          onChange={(e) => setTyped((t) => ({ ...t, qty: e.target.value }))}
          hint={planned ? `About ${formatUsd(Number(qty) * Number(coinPrice))} of it.` : undefined}
          required
        />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.saved && !pending && <Notice tone="success">Slot filled.</Notice>}
      <div>
        <Button disabled={pending || !coin}>{pending ? "Filling…" : "Fill the slot"}</Button>
      </div>
    </form>
  );
}
