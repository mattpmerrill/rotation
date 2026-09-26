"use client";

import type { CoinChange } from "@/domain/coins";
import type { Coin } from "@/domain/types";
import { formatPrice } from "@/lib/format";
import { Change } from "@/ui/Change";
import { Money, useUnit } from "@/ui/unit";

const STATUS: Record<CoinChange["status"], string> = { held: "Held", partly_sold: "Partly sold", sold: "Sold" };

/** Each basket coin since the buy-in: against BTC in BTC view, in dollars in USD view. */
export function CoinTable({
  changes,
  coins,
  btcPrice,
}: {
  changes: CoinChange[];
  coins: Record<string, Coin>;
  btcPrice: number;
}) {
  const { unit } = useUnit();
  const change = (c: CoinChange) => (unit === "btc" ? c.changeBtc : c.changeUsd);
  const widest = Math.max(0.01, ...changes.map((c) => Math.abs(change(c))));

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Each coin since the buy-in</caption>
      <thead className="text-ink-3 text-left text-xs">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            Coin
          </th>
          <th scope="col" className="pb-2 font-medium">
            {unit === "btc" ? "Against BTC" : "In USD"}
          </th>
          <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">
            Price
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Holding
          </th>
        </tr>
      </thead>
      <tbody className="divide-line divide-y">
        {changes.map((c) => (
          <tr key={c.asset}>
            <th scope="row" className="py-3 pr-3 text-left font-semibold">
              {coins[c.asset]?.symbol ?? c.asset}
              <span className="text-ink-3 block text-xs font-normal">{STATUS[c.status]}</span>
            </th>
            <td className="py-3 pr-3">
              <div className="flex items-center gap-3">
                <Change value={change(c)} className="w-16 shrink-0" />
                <span aria-hidden className="hidden h-2 flex-1 sm:block">
                  <span
                    className={`block h-2 rounded-full ${change(c) >= 0 ? "bg-gain/70" : "bg-loss/70"}`}
                    style={{ width: `${(Math.abs(change(c)) / widest) * 100}%` }}
                  />
                </span>
              </div>
            </td>
            <td className="text-ink-2 hidden py-3 text-right sm:table-cell">{formatPrice(c.price)}</td>
            <td className="py-3 text-right">
              {c.qty > 0 ? (
                <Money btc={c.valueUsd / btcPrice} usd={c.valueUsd} />
              ) : (
                <span className="text-ink-3">None</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
