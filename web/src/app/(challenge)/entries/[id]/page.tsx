import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/data/viewer";
import { CoinTable } from "@/features/entry/components/CoinTable";
import { ReferenceDates } from "@/features/entry/components/ReferenceDates";
import { ScoreHero } from "@/features/entry/components/ScoreHero";
import { ValueChart } from "@/features/entry/components/ValueChart";
import { getEntryView } from "@/features/entry/queries";
import { TradeForm } from "@/features/trades/components/TradeForm";
import { FillSlotForm } from "@/features/trades/components/FillSlotForm";
import { TradeLog } from "@/features/trades/components/TradeLog";
import { BTC } from "@/domain/types";
import { editLockedReason } from "@/domain/buyIn";
import { DeleteBasketButton } from "@/features/picker/components/DeleteBasketButton";
import { buttonClass } from "@/ui/Button";
import Link from "next/link";
import { formatBtc, formatDay } from "@/lib/format";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { Section } from "@/ui/Section";

export const metadata: Metadata = { title: "Basket" };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const id = Number((await params).id);
  const view = Number.isInteger(id) ? await getEntryView(id, viewer) : null;
  if (!view) notFound();

  const { entry, standing, isOwner } = view;
  const buyInSale = view.trades.find((t) => t.asset === BTC && t.side === "sell" && t.tradedOn === entry.startedOn);
  const startUsd = entry.btcIn * (buyInSale?.priceUsd ?? standing.series[0]?.btcPrice ?? 0);
  const finished = standing.phase === "back_in_btc";
  const editable = isOwner && !editLockedReason(view.trades);

  return (
    <>
      <section className="grid gap-5">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-ink-2 text-lg font-semibold">
              {isOwner ? "Your basket" : `${entry.playerName}'s basket`}
            </h1>
            {isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/entries/${entry.id}/edit`} className={buttonClass("quiet")}>
                  {editable ? "Edit basket" : "Edit or delete"}
                </Link>
                {editable && <DeleteBasketButton entryId={entry.id} />}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-ink-3 text-sm">
              In since {formatDay(entry.startedOn)}.
              {standing.best != null &&
                standing.worst != null &&
                ` Best ${standing.best.toFixed(2)}×, lowest ${standing.worst.toFixed(2)}×.`}
            </p>
            {!finished && <LiveRefresh liveAt={view.liveAt} />}
          </div>
        </div>
        <ScoreHero btcIn={entry.btcIn} startUsd={startUsd} now={standing.now} phase={standing.phase} />
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

      {view.slots.open > 0 && (
        <Section title={view.slots.open === 1 ? "A waiting slot" : `${view.slots.open} waiting slots`} panel>
          {view.slots.fill ? (
            <FillSlotForm
              entryId={entry.id}
              share={view.slots.share}
              coins={view.slots.fill.coins}
              prices={view.slots.fill.prices}
              from={view.slots.fill.from}
            />
          ) : (
            <p className="text-ink-2 text-sm">
              {view.slots.closedReason && view.slots.waitingBtc === 0
                ? view.slots.closedReason
                : `${formatBtc(view.slots.waitingBtc)} is waiting as BTC, to buy a coin later.`}
            </p>
          )}
        </Section>
      )}

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
