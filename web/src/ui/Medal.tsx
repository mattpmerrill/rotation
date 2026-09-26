/** A leaderboard place: gold, silver and bronze for the top three, a plain number after. */
const METAL = ["from-gold to-btc", "from-silver to-[#8e98ab]", "from-bronze to-[#9a5a38]"];

export function Medal({ place }: { place: number }) {
  if (place > 3) return <span className="font-display text-ink-3 grid size-9 place-items-center text-sm">{place}</span>;
  return (
    <span
      className={`font-display text-bg grid size-9 place-items-center rounded-full bg-gradient-to-br text-sm font-semibold ${METAL[place - 1]} ${place === 1 ? "shadow-[0_0_20px_-4px_var(--gold)]" : ""}`}
      aria-label={`Place ${place}`}
    >
      {place}
    </span>
  );
}
