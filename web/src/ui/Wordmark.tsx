/** "1 → ??": the challenge's name, as a mark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      1<span className="text-btc mx-1">→</span>??
    </span>
  );
}
