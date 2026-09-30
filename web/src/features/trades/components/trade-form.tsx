"use client";

import { BitcoinSpinner } from "@/ui/bitcoin-spinner";
import { useActionState, useState } from "react";
import { priceOn } from "@/domain/prices";
import { RULES } from "@/domain/rules";
import { defaultTradeFee, rebuyAllQty } from "@/domain/trades";
import { BTC, type Coin, type PriceBook } from "@/domain/types";
import { todayUtc } from "@/lib/days";
import { formatQty, formatUsd } from "@/lib/format";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Notice } from "@/ui/notice";
import { logTrade, type TradeFormState } from "../actions";

type Kind = "sell_alt" | "buy_btc";

interface Props {
  entryId: number;
  startedOn: string;
  alts: Record<string, number>;
  usdt: number;
  coins: Record<string, Coin>;
  prices: PriceBook;
}

/**
 * Log a sell or a rebuy. The price fills in from that day's close (editable: use what you
 * actually got), and the fee defaults to 1% of the trade. After a save the fields reset.
 */
export function TradeForm(props: Props) {
  const [state, action, pending] = useActionState(logTrade, {});
  // A new key after each save remounts the fields, which clears them.
  return <TradeFields key={state.saved ?? 0} {...props} state={state} action={action} pending={pending} />;
}

function TradeFields({
  entryId,
  startedOn,
  alts,
  usdt,
  coins,
  prices,
  state,
  action,
  pending,
}: Props & { state: TradeFormState; action: (form: FormData) => void; pending: boolean }) {
  const held = Object.keys(alts);
  const [kind, setKind] = useState<Kind>(held.length ? "sell_alt" : "buy_btc");
  const [asset, setAsset] = useState(held[0] ?? "");
  const [day, setDay] = useState(todayUtc());
  const [qty, setQty] = useState("");
  // Typed-in price and fee; null means "use the default" (that day's close; 1% of the trade).
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [typedFee, setTypedFee] = useState<string | null>(null);

  const traded = kind === "buy_btc" ? BTC : asset;
  const closeThatDay = priceOn(prices, traded, day);
  const price = typedPrice ?? (closeThatDay ? String(closeThatDay) : "");
  const notional = Number(qty) * Number(price);
  const fee = typedFee ?? (notional > 0 ? defaultTradeFee(Number(qty), Number(price)).toFixed(2) : "");

  const fillAll = () => {
    if (kind === "sell_alt") setQty(String(alts[asset] ?? ""));
    else if (Number(price) > 0) setQty(String(rebuyAllQty(usdt, Number(price))));
  };

  const canSell = held.length > 0;
  const canRebuy = usdt >= RULES.dust.usdt;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="asset" value={traded} />

      <div role="radiogroup" aria-label="What did you do?" className="grid grid-cols-2 gap-2">
        {(
          [
            ["sell_alt", "Sold an alt", canSell],
            ["buy_btc", "Rebought BTC", canRebuy],
          ] as const
        ).map(([k, label, enabled]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            disabled={!enabled}
            onClick={() => {
              setKind(k);
              setQty("");
              setTypedPrice(null);
            }}
            className={`rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
              kind === k ? "border-btc bg-btc/10 text-ink" : "border-line text-ink-2 hover:border-ink-3"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "sell_alt" ? (
          <div className="grid gap-1.5">
            <label htmlFor="coin" className="text-ink-2 text-sm font-medium">
              Coin
            </label>
            <select
              id="coin"
              className="field"
              value={asset}
              onChange={(e) => {
                setAsset(e.target.value);
                setTypedPrice(null);
              }}
            >
              {held.map((a) => (
                <option key={a} value={a}>
                  {coins[a]?.symbol ?? a} ({formatQty(alts[a] ?? 0)} held)
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-ink-2 self-end text-sm">You hold {formatUsd(usdt)} in USDT to rebuy with.</p>
        )}
        <Field
          id="tradedOn"
          name="tradedOn"
          type="date"
          label="Date"
          min={startedOn}
          max={todayUtc()}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setTypedPrice(null);
          }}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="qty" className="text-ink-2 text-sm font-medium">
              {kind === "sell_alt" ? `Amount of ${coins[asset]?.symbol ?? "coin"}` : "BTC bought"}
            </label>
            <button type="button" onClick={fillAll} className="text-btc hover:text-gold text-xs font-semibold">
              {kind === "sell_alt" ? "All" : "All USDT"}
            </button>
          </div>
          <input
            id="qty"
            name="qty"
            className="field"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </div>
        <Field
          id="priceUsd"
          name="priceUsd"
          label="Price (USD)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setTypedPrice(e.target.value)}
          hint={closeThatDay ? "That day's close. Change it to your fill." : "No price for that day yet: enter yours."}
          required
        />
        <Field
          id="feeUsd"
          name="feeUsd"
          label="Fee (USD)"
          inputMode="decimal"
          value={fee}
          onChange={(e) => setTypedFee(e.target.value)}
          hint="1% of the trade unless you change it."
        />
      </div>

      <Field id="note" name="note" label="Note (optional)" maxLength={280} placeholder="Why now?" />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.saved && !pending && <Notice tone="success">Trade saved.</Notice>}

      <div>
        <Button disabled={pending || (!canSell && !canRebuy)}>
          {pending && <BitcoinSpinner size="sm" label="Saving" />}
          {pending ? "Saving…" : kind === "sell_alt" ? "Save the sell" : "Save the rebuy"}
        </Button>
      </div>
    </form>
  );
}
