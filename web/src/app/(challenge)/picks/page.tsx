import type { Metadata } from "next";
import { requireViewer } from "@/features/auth/viewer";
import { PickCard } from "@/features/picks/components/pick-card";
import { getPicks } from "@/features/picks/queries";
import { Notice } from "@/ui/notice";

export const metadata: Metadata = { title: "Joi’s top picks" };

export default async function PicksPage() {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const { picks, coins, daysSinceHalving } = await getPicks();

  return (
    <>
      <section className="grid gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Joi’s top picks</h1>
        <p className="text-ink-2 max-w-2xl text-lg">
          The baskets that did best from this point in the last two cycles (day {daysSinceHalving} after the halving),
          and why. Every number is 1 BTC split equally across the coins, 1% fee each way.
        </p>
        <div className="panel grid gap-3 p-5 sm:p-6">
          <h2 className="font-semibold">What the winners had in common</h2>
          <ul className="text-ink-2 grid gap-2">
            <li>
              <span className="text-gold font-semibold">New coins, bought early.</span> Most of the gain came from coins
              bought soon after they started trading, like Solana in 2020 and Hyperliquid in 2024. Until then their
              share sat in BTC, which also kept it out of the bear market.
            </li>
            <li>
              <span className="text-accent-violet font-semibold">A story people bought into.</span> Each winner rode a
              theme of its cycle: fast new chains, DeFi, AI, real-world assets.
            </li>
            <li>
              <span className="text-accent-magenta font-semibold">Big old names need an alt season.</span> They
              multiplied in 2018-21 and lost BTC in 2022-25.
            </li>
          </ul>
        </div>
      </section>

      {picks.map((p, i) => (
        <PickCard key={p.slug} pick={p} coins={coins} rank={i + 1} />
      ))}

      <Notice>
        These picks come from searching about half a million baskets knowing how it turned out, so they’re the best
        case, not a forecast. In the challenge you choose from today’s top 100 on the day you buy in, so the “buy it
        when it launches” part only works for coins that already exist.
      </Notice>
    </>
  );
}
