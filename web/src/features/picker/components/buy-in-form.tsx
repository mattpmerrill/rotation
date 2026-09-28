"use client";

import { BitcoinSpinner } from "@/ui/bitcoin-spinner";
import { useActionState, useMemo, useState } from "react";
import { btcSoldAtBuyIn, checkBuyIn, planBuyIn, usdtAfter, type DraftTrade } from "@/domain/buy-in";
import { priceOn } from "@/domain/prices";
import { RULES } from "@/domain/rules";
import { BTC, type PriceBook } from "@/domain/types";
import { formatBtc, formatUsd } from "@/lib/format";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Notice } from "@/ui/notice";
import { editBasket, startChallenge, type BuyInState } from "../actions";

type Overrides = Record<string, { qty?: string; price?: string }>;

/** A saved buy-in to edit: the form starts from what was logged. */
export interface BuyInEdit {
  entryId: number;
  btcIn: number;
  startedOn: string;
  feeRate: number;
  /** The logged amounts and prices, by asset. */
  overrides: Overrides;
}

/**
 * The buy-in: how much BTC, which day, and the trades. The app plans equal dollar amounts at
 * that day's closes; edit any amount or price to match what you actually got.
 */
export function BuyInForm({
  basket,
  slots,
  symbols,
  prices,
  window,
  editing,
}: {
  /** Set when editing an existing basket rather than starting one. */
  editing?: BuyInEdit | undefined;
  basket: string[];
  /** Waiting slots: their share of the BTC isn't sold. */
  slots: number;
  symbols: Record<string, string>;
  prices: PriceBook;
  window: [string, string];
}) {
  const [btcIn, setBtcIn] = useState(editing ? String(editing.btcIn) : "1");
  const [day, setDay] = useState(editing?.startedOn ?? window[1]);
  const [feePct, setFeePct] = useState(String(Number(((editing?.feeRate ?? RULES.defaultFeeRate) * 100).toFixed(4))));
  const [overrides, setOverrides] = useState<Overrides>(editing?.overrides ?? {});
  const [state, action, pending] = useActionState(editing ? editBasket : startChallenge, {} as BuyInState);

  const feeRate = Number(feePct) / 100;
  const btcPrice = priceOn(prices, BTC, day);
  const missing = basket.filter((id) => priceOn(prices, id, day) == null);

  const trades: DraftTrade[] = useMemo(() => {
    if (!btcPrice || missing.length || !(Number(btcIn) > 0) || !(feeRate >= 0)) return [];
    const plan = planBuyIn({
      btcIn: Number(btcIn),
      btcPriceUsd: Number(overrides[BTC]?.price ?? btcPrice),
      coinPricesUsd: Object.fromEntries(
        basket.map((id) => [id, Number(overrides[id]?.price ?? priceOn(prices, id, day))]),
      ),
      basket,
      slots,
      feeRate,
    });
    // apply typed-in amounts; fees follow the edited amounts
    return plan.map((t) => {
      const o = overrides[t.asset];
      const qty = t.asset === BTC ? t.qty : Number(o?.qty ?? t.qty);
      return { ...t, qty, feeUsd: qty * t.priceUsd * feeRate };
    });
  }, [btcIn, btcPrice, basket, slots, day, feeRate, missing.length, overrides, prices]);

  const problems = trades.length ? checkBuyIn(Number(btcIn), basket, slots, trades) : [];
  const left = trades.length ? usdtAfter(trades) : 0;
  const edit = (asset: string, field: "qty" | "price", value: string) =>
    setOverrides((o) => ({ ...o, [asset]: { ...o[asset], [field]: value } }));

  const payload = JSON.stringify({ startedOn: day, btcIn: Number(btcIn), basket, slots, trades });

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={payload} />
      {editing && <input type="hidden" name="entryId" value={editing.entryId} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="btcIn"
          label="BTC in"
          inputMode="decimal"
          value={btcIn}
          onChange={(e) => setBtcIn(e.target.value)}
          hint={`Up to ${RULES.maxBtcIn} BTC.`}
        />
        <Field
          id="day"
          label="Buy-in date"
          type="date"
          min={window[0]}
          max={window[1]}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setOverrides({});
          }}
        />
        <Field
          id="fee"
          label="Fee per trade (%)"
          inputMode="decimal"
          value={feePct}
          onChange={(e) => setFeePct(e.target.value)}
        />
      </div>

      {!btcPrice || missing.length ? (
        <Notice tone="error">
          No price on that day for {missing.length ? missing.map((id) => symbols[id]).join(", ") : "BTC"}. Pick another
          date.
        </Notice>
      ) : (
        trades.length > 0 && (
          <table className="w-full text-sm">
            <caption className="sr-only">Buy-in trades</caption>
            <thead className="text-ink-3 text-left text-xs">
              <tr>
                <th scope="col" className="pb-2 font-medium">
                  Trade
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Amount
                </th>
                <th scope="col" className="pb-2 font-medium">
                  Price (USD)
                </th>
                <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {trades.map((t) => (
                <tr key={t.asset}>
                  <th scope="row" className="py-2 pr-2 text-left font-semibold">
                    {t.asset === BTC ? "Sell BTC" : `Buy ${symbols[t.asset]}`}
                  </th>
                  <td className="py-2 pr-2">
                    {t.asset === BTC ? (
                      formatBtc(t.qty)
                    ) : (
                      <input
                        aria-label={`${symbols[t.asset]} amount`}
                        className="field py-1.5"
                        inputMode="decimal"
                        value={overrides[t.asset]?.qty ?? String(Number(t.qty.toPrecision(8)))}
                        onChange={(e) => edit(t.asset, "qty", e.target.value)}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      aria-label={`${t.asset === BTC ? "BTC" : symbols[t.asset]} price`}
                      className="field py-1.5"
                      inputMode="decimal"
                      value={overrides[t.asset]?.price ?? String(t.priceUsd)}
                      onChange={(e) => edit(t.asset, "price", e.target.value)}
                    />
                  </td>
                  <td className="text-ink-2 hidden py-2 text-right sm:table-cell">{formatUsd(t.qty * t.priceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {trades.length > 0 && (
        <p className="text-ink-2 text-sm">
          {Math.abs(left) < 0.01
            ? "Every dollar from the BTC sale goes into the basket."
            : left > 0
              ? `${formatUsd(left, { cents: true })} stays in USDT.`
              : null}
          {slots > 0 &&
            ` ${formatBtc(Number(btcIn) - btcSoldAtBuyIn(Number(btcIn), basket.length, slots))} waits as BTC for your ${slots === 1 ? "slot" : `${slots} slots`}.`}
        </p>
      )}

      {[...problems, ...(state.errors ?? [])].map((p) => (
        <Notice key={p} tone="error">
          {p}
        </Notice>
      ))}

      <div>
        <Button disabled={pending || !trades.length || problems.length > 0}>
          {pending && <BitcoinSpinner size="sm" label={editing ? "Saving" : "Starting"} />}
          {editing ? (pending ? "Saving…" : "Save changes") : pending ? "Starting…" : "Start my challenge"}
        </Button>
      </div>
    </form>
  );
}
