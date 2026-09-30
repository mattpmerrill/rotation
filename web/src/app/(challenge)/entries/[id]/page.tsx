import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinTable } from "@/features/entry/components/coin-table";
import { EntryHeader } from "@/features/entry/components/entry-header";
import { ReferenceDates } from "@/features/entry/components/reference-dates";
import { ScoreHero } from "@/features/entry/components/score-hero";
import { ValueChart } from "@/features/entry/components/value-chart";
import { getEntryView } from "@/features/entry/queries";
import { requireViewer } from "@/features/auth/viewer";
import { DeleteBasketButton } from "@/features/picker/components/delete-basket-button";
import { TradeForm } from "@/features/trades/components/trade-form";
import { TradeLog } from "@/features/trades/components/trade-log";
import { WaitingSlots } from "@/features/trades/components/waiting-slots";
import { buttonClass } from "@/ui/button";
import { Section } from "@/ui/section";

export const metadata: Metadata = { title: "Basket" };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const view = await getEntryView((await params).id, viewer);
  if (!view) notFound();

  const { entry, standing, isOwner, finished, editable } = view;

  return (
    <>
      <section className="grid gap-5">
        <EntryHeader
          entry={entry}
          standing={standing}
          isOwner={isOwner}
          finished={finished}
          liveAt={view.liveAt}
          actions={
            isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/entries/${entry.id}/edit`} className={buttonClass("quiet")}>
                  {editable ? "Edit basket" : "Edit or delete"}
                </Link>
                {editable && <DeleteBasketButton entryId={entry.id} />}
              </div>
            )
          }
        />
        <ScoreHero btcIn={entry.btcIn} startUsd={standing.startUsd} now={standing.now} phase={standing.phase} />
      </section>

      <Section title="Value over time" panel>
        <ValueChart series={standing.series} btcIn={entry.btcIn} />
      </Section>

      <Section title="The coins" panel>
        {view.changes.length && standing.now ? (
          <CoinTable changes={view.changes} coins={view.coins} btcPrice={standing.now.btcPrice} />
        ) : (
          <p className="text-ink-3 text-sm">Prices for these coins arrive with the next daily update.</p>
        )}
      </Section>

      {view.slots.open > 0 && <WaitingSlots entryId={entry.id} slots={view.slots} />}

      {isOwner && !finished && (
        <Section title="Log a trade" panel>
          <TradeForm
            entryId={entry.id}
            startedOn={entry.startedOn}
            alts={view.holdings.alts}
            usdt={view.holdings.usdt}
            coins={view.coins}
            prices={view.prices}
          />
        </Section>
      )}

      <Section title="Trades">
        <TradeLog trades={view.trades} coins={view.coins} canEdit={isOwner} />
      </Section>

      <Section title="Reference dates" panel>
        <ReferenceDates cycle={view.cycle} market={view.market} rebuyRule={view.rebuyRule} />
      </Section>
    </>
  );
}
