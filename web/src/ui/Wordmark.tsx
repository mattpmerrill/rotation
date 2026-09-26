/** "1 Bitty": a gold coin with a 1 on it, and the name. */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className={`from-gold via-btc font-display text-bg ring-gold/40 grid place-items-center rounded-full bg-gradient-to-br to-[#c96a06] font-semibold shadow-[0_0_24px_-6px_var(--btc)] ring-2 ${
          lg ? "size-14 text-2xl" : "size-8 text-sm"
        }`}
      >
        1
      </span>
      <span className={`font-display font-semibold tracking-tight ${lg ? "text-4xl" : "text-lg"}`}>
        Bitty<span className="text-btc">.</span>
      </span>
    </span>
  );
}
