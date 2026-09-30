import Link from "next/link";

/** A one-line reminder of how buying at this point in the cycle has gone before. */
export function TimingNote({ wins, of, day }: { wins: number; of: number; day: number }) {
  return (
    <p className={`panel px-5 py-4 text-sm ${wins === 0 ? "border-loss/40" : ""}`}>
      <span className="font-semibold">Timing check:</span> buying the top 10 alts around day {day} after the halving
      beat holding BTC in {wins} of {of} past cycles.{" "}
      <Link href="/timing" className="text-gold font-semibold underline-offset-4 hover:underline">
        See the best time to buy
      </Link>
    </p>
  );
}
