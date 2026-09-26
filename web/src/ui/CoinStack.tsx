import { CoinIcon } from "./CoinIcon";

/** A basket at a glance: overlapping coin icons, with the tickers for screen readers. */
export function CoinStack({
  coins,
  size = 26,
  max = 8,
}: {
  coins: { symbol: string; image: string | null }[];
  size?: number;
  max?: number;
}) {
  const shown = coins.slice(0, max);
  return (
    <span className="inline-flex items-center" role="img" aria-label={coins.map((c) => c.symbol).join(", ")}>
      {shown.map((c, i) => (
        <span
          key={c.symbol}
          title={c.symbol}
          className="ring-surface rounded-full ring-2"
          style={{ marginLeft: i ? -size * 0.3 : 0, zIndex: shown.length - i }}
        >
          <CoinIcon symbol={c.symbol} image={c.image} size={size} />
        </span>
      ))}
      {coins.length > max && <span className="text-ink-3 ml-1.5 text-xs font-semibold">+{coins.length - max}</span>}
    </span>
  );
}
