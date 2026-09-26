import { isBuyInTrade } from "@/domain/trades";
import type { Coin, Trade } from "@/domain/types";
import { formatDay, formatPrice, formatQty, formatUsd } from "@/lib/format";
import { CoinIcon } from "@/ui/CoinIcon";
import { DeleteTradeButton } from "./DeleteTradeButton";

/** Every trade in an entry, newest first. The owner can delete their sells and rebuys. */
export function TradeLog({
  trades,
  coins,
  canEdit,
}: {
  trades: Trade[];
  coins: Record<string, Coin>;
  canEdit: boolean;
}) {
  return (
    <ul className="divide-line divide-y">
      {[...trades].reverse().map((t) => {
        const buyIn = isBuyInTrade(t);
        const fill = t.kind === "fill";
        return (
          <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 py-3 text-sm">
            <span className="row-span-2">
              <CoinIcon symbol={coins[t.asset]?.symbol ?? t.asset} image={coins[t.asset]?.image ?? null} size={28} />
            </span>
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
              {fill && ", slot fill"}
            </span>
            <span className="text-right">{canEdit && !buyIn && !fill && <DeleteTradeButton tradeId={t.id} />}</span>
            {t.note && <span className="text-ink-2 col-span-2 col-start-2">“{t.note}”</span>}
          </li>
        );
      })}
    </ul>
  );
}
