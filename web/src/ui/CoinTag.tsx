/** A coin's ticker as a small tag. */
export function CoinTag({ symbol, muted = false }: { symbol: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${
        muted ? "border-line text-ink-3 line-through" : "border-line bg-surface-2 text-ink"
      }`}
    >
      {symbol}
    </span>
  );
}
