/**
 * The loading mark: a gold Bitcoin that spins on its edge, with real thickness, a light sweep
 * across the face and a glow pulsing under it. Pure CSS (see .btc-spinner in globals.css), so it
 * works in server components and paints before any JS loads. With reduced motion it sits still.
 */

const SIZES = { sm: 18, md: 44, lg: 88 } as const;
/** Coin edge: stacked discs between the two faces. */
const EDGE_LAYERS = 14;

export function BitcoinSpinner({
  size = "md",
  label = "Loading",
}: {
  size?: keyof typeof SIZES;
  /** Read by screen readers; hidden on screen. */
  label?: string;
}) {
  const px = SIZES[size];
  const depth = Math.max(2, Math.round(px * 0.14));
  return (
    <span
      role="status"
      aria-label={label}
      className={`btc-spinner btc-spinner-${size}`}
      style={{ "--coin": `${px}px`, "--depth": `${depth}px` } as React.CSSProperties}
    >
      {size !== "sm" && <span aria-hidden className="btc-spinner-glow" />}
      <span aria-hidden className="btc-spinner-coin">
        {Array.from({ length: EDGE_LAYERS }, (_, i) => (
          <span
            key={i}
            className="btc-spinner-edge"
            style={{ "--z": `${(i / (EDGE_LAYERS - 1) - 0.5) * depth}px` } as React.CSSProperties}
          />
        ))}
        <span className="btc-spinner-face btc-spinner-front">₿</span>
        <span className="btc-spinner-face btc-spinner-back">₿</span>
      </span>
      {size !== "sm" && <span aria-hidden className="btc-spinner-shadow" />}
    </span>
  );
}

/** A full loading screen: the coin, big, with a line under it. */
export function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <div className="grid justify-items-center gap-5">
        <BitcoinSpinner size="lg" label={message} />
        <p className="text-ink-3 btc-spinner-caption text-sm font-medium tracking-wide">{message}</p>
      </div>
    </div>
  );
}
