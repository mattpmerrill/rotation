import Image from "next/image";

/** Fallback colors for a coin without an icon, picked from its ticker so they stay stable. */
const FALLBACK = ["#3987e5", "#1fb584", "#9085e9", "#e0679a", "#f7931a", "#ffc247"];

/** A coin's round icon, or its first letter on a color if there's no icon. */
export function CoinIcon({ symbol, image, size = 24 }: { symbol: string; image: string | null; size?: number }) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="bg-surface-2 shrink-0 rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }
  const color = FALLBACK[[...symbol].reduce((h, ch) => h + ch.charCodeAt(0), 0) % FALLBACK.length];
  return (
    <span
      aria-hidden
      className="text-bg grid shrink-0 place-items-center rounded-full font-bold"
      style={{ width: size, height: size, background: color, fontSize: size * 0.45 }}
    >
      {symbol[0]}
    </span>
  );
}
