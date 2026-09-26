import { CoinIcon } from "./CoinIcon";

/** A coin as a small pill: icon and ticker. */
export function CoinTag({ symbol, image, muted = false }: { symbol: string; image?: string | null; muted?: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs font-semibold ${
        muted ? "border-line text-ink-3 line-through" : "border-line bg-surface-2 text-ink"
      }`}
    >
      <CoinIcon symbol={symbol} image={image ?? null} size={20} />
      {symbol}
    </span>
  );
}
