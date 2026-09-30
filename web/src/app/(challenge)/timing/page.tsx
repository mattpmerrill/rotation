import type { Metadata } from "next";
import { requireViewer } from "@/features/auth/viewer";
import { CoinChooser } from "@/features/timing/components/coin-chooser";
import { StretchTable } from "@/features/timing/components/stretch-table";
import { TimingVerdict } from "@/features/timing/components/timing-verdict";
import { getTiming } from "@/features/timing/queries";
import { nextGoodStretch } from "@/domain/timing";
import { addDays } from "@/lib/days";
import { formatMonth } from "@/lib/format";
import { TimingChart } from "@/ui/charts/timing-chart";
import { Notice } from "@/ui/notice";
import { Section } from "@/ui/section";

export const metadata: Metadata = { title: "Best time to buy" };

export default async function TimingPage({ searchParams }: { searchParams: Promise<{ coin?: string }> }) {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const { coin: coinId } = await searchParams;
  const { cycle, market, coin, coinOptions } = await getTiming(coinId ?? null);
  const today = cycle.daysSinceHalving;
  const next = nextGoodStretch(market.stretches, today);
  const nextStart = next && addDays(next.nextCycle ? cycle.nextHalvingEst : cycle.lastHalving, next.stretch.from);
  const nextEnd = next && addDays(next.nextCycle ? cycle.nextHalvingEst : cycle.lastHalving, next.stretch.to);

  return (
    <>
      <section className="grid gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Best time to buy</h1>
        <p className="text-ink-2 max-w-2xl text-lg">
          Every other week since 2016: if you’d put 1 BTC into alts that week and sold in the next old sell window, how
          much BTC would you have? Laid out by how far into the four-year cycle you bought.
        </p>
      </section>

      <TimingVerdict stance={market.now} day={today} subject="the top 10 alts" />

      {next && nextStart && nextEnd && (
        <div className="panel border-gain/40 grid gap-1 p-5 sm:p-6">
          <span className="text-ink-3 text-sm">The next stretch that beat BTC in most past cycles</span>
          <span className="font-display text-gain text-xl font-semibold sm:text-2xl">
            {formatMonth(nextStart)} to {formatMonth(nextEnd)}
          </span>
          <span className="text-ink-2 text-sm">
            Buying in this stretch beat holding BTC in at least {next.stretch.stance.wins} of {next.stretch.stance.of}{" "}
            past cycles. Dates after the next halving are estimates.
          </span>
        </div>
      )}

      <Section title="The top 10 alts, by when they were bought" panel>
        <TimingChart points={market.points} stretches={market.stretches} today={today} />
      </Section>

      <Section title="By quarter of the cycle" panel>
        <StretchTable stretches={market.stretches} today={today} />
      </Section>

      <Section title="One coin" panel>
        <div className="grid gap-6">
          <p className="text-ink-2 text-sm">
            The same view for a single coin. These coins are today’s survivors, so their history looks better than a
            pick made back then would have.
          </p>
          <CoinChooser coins={coinOptions} selected={coin?.coin ?? null} />
          {coin && (
            <>
              <TimingVerdict stance={coin.now} day={today} subject={coin.label} />
              <TimingChart points={coin.points} stretches={coin.stretches} today={today} />
              <StretchTable stretches={coin.stretches} today={today} />
            </>
          )}
        </div>
      </Section>

      <Notice>
        The top 10 are the ten biggest alts on each buy day, so there’s no hindsight in that view; coins that later died
        count as worth nothing. It covers three alt seasons at most, and the 2024 cycle had none. History is a guide,
        not a promise.
      </Notice>
    </>
  );
}
