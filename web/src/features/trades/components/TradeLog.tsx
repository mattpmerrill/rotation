import { isBuyInTrade } from "@/domain/trades";
import type { Coin, Entry, Trade } from "@/domain/types";
import { formatDay, formatPrice, formatQty, formatUsd } from "@/lib/format";
import { DeleteTradeButton } from "./DeleteTradeButton";

/** Every trade in an entry, newest first. The owner can delete trades after the buy-in. */
export function TradeLog({
  trades,
  coins,
  entry,
  canEdit,
}: {
  trades: Trade[];
  coins: Record<string, Coin>;
  entry: Entry;
  canEdit: boolean;
}) {
  return (
    <ul className="divide-line divide-y">
      {[...trades].reverse().map((t) => {
        const buyIn = isBuyInTrade(entry, t);
        return (
          <li key={t.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 py-3 text-sm">
            <span>
              <span className={t.side === "buy" ? "text-gain" : "text-loss"}>
                {t.side === "buy" ? "Bought" : "Sold"}
              </span>{" "}
              <span className="font-semibold">
                {formatQty(t.qty)} {coins[t.asset]?.symbol ?? t.asset}
              </span>
            </span>
            <span className="text-right font-semibold">{formatUsd(t.qty * t.priceUsd)}</span>
            <span className="text-ink-3">
              {formatDay(t.tradedOn)}, at {formatPrice(t.priceUsd)}
              {buyIn && ", buy-in"}
            </span>
            <span className="text-right">{canEdit && !buyIn && <DeleteTradeButton tradeId={t.id} />}</span>
            {t.note && <span className="text-ink-2 col-span-2">“{t.note}”</span>}
          </li>
        );
      })}
    </ul>
  );
}
