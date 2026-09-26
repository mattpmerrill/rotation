import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/data/viewer";
import { PickerFlow } from "@/features/picker/components/PickerFlow";
import { getPickerData } from "@/features/picker/queries";
import { Notice } from "@/ui/Notice";

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
      <PickerFlow
        coins={data.coins}
        daysSinceHalving={data.daysSinceHalving}
        sellWindowDays={data.sellWindowDays}
        window={data.window}
        prices={data.prices}
        initialBasket={initialBasket}
      />
    </>
  );
}
