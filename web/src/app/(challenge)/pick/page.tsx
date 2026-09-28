import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/data/viewer";
import { PickerFlow } from "@/features/picker/components/picker-flow";
import { getPickerData } from "@/features/picker/queries";
import { getTiming } from "@/features/timing/queries";
import Link from "next/link";
import { Notice } from "@/ui/notice";

export const metadata: Metadata = { title: "Pick a basket" };

export default async function PickPage({ searchParams }: { searchParams: Promise<{ basket?: string }> }) {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const data = await getPickerData(viewer);
  const initialBasket = ((await searchParams).basket ?? "").split(",").filter(Boolean);
  if (data.status === "already_in") redirect(`/entries/${data.entryId}`);
  if (data.status === "no_challenge") return <Notice>No challenge is open right now.</Notice>;

  return (
    <>
      <section className="grid gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Pick a basket</h1>
        <p className="text-ink-2 max-w-2xl">
          Choose 2 to 8 coins from today’s top 100 and see how they did from this point in past cycles. When you’ve
          bought in on your exchange, log it here: up to 1 BTC, split equally unless you change the amounts.
        </p>
      </section>
      <TimingNote />
      <PickerFlow
        coins={data.coins}
        daysSinceHalving={data.daysSinceHalving}
        sellWindowDays={data.sellWindowDays}
        window={data.window}
        prices={data.prices}
        initialBasket={initialBasket}
        btcIcon={data.btcIcon}
      />
    </>
  );
}

/** A one-line reminder of how buying at this point in the cycle has gone before. */
async function TimingNote() {
  const { market, cycle } = await getTiming(null);
  const { wins, of } = market.now;
  if (!of) return null;
  return (
    <p className={`panel px-5 py-4 text-sm ${wins === 0 ? "border-loss/40" : ""}`}>
      <span className="font-semibold">Timing check:</span> buying the top 10 alts around day {cycle.daysSinceHalving}{" "}
      after the halving beat holding BTC in {wins} of {of} past cycles.{" "}
      <Link href="/timing" className="text-gold font-semibold underline-offset-4 hover:underline">
        See the best time to buy
      </Link>
    </p>
  );
}
