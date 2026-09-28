import { CoinIcon } from "./CoinIcon";

/** A coin as a small pill: icon and ticker. */
export function CoinTag({
  symbol,
  image,
  muted = false,
  dashed = false,
}: {
  symbol: string;
  image?: string | null | undefined;
  muted?: boolean;
  /** A waiting slot rather than a coin. */
  dashed?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs font-semibold ${
        muted
          ? "border-line text-ink-3 line-through"
          : dashed
            ? "border-btc/50 bg-btc/10 text-gold border-dashed"
            : "border-line bg-surface-2 text-ink"
      }`}
    >
      <CoinIcon symbol={symbol} image={image ?? null} size={20} />
      {symbol}
    </span>
  );
}
