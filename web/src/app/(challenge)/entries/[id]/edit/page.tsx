import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/features/auth/viewer";
import { DeleteBasketButton } from "@/features/picker/components/delete-basket-button";
import { PickerFlow } from "@/features/picker/components/picker-flow";
import { getEditData } from "@/features/picker/queries";
import { Notice } from "@/ui/notice";

export const metadata: Metadata = { title: "Edit basket" };

export default async function EditBasketPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (!viewer.isMember) return null;
  const data = await getEditData((await params).id, viewer);
  if (!data) notFound();

  const back = (
    <Link
      href={`/entries/${data.entryId}`}
      className="text-gold text-sm font-semibold underline-offset-4 hover:underline"
    >
      ← Back to your basket
    </Link>
  );

  if (data.status === "locked")
    return (
      <>
        {back}
        <h1 className="text-3xl font-semibold sm:text-4xl">Edit basket</h1>
        <Notice>{data.reason}</Notice>
        <div>
          <DeleteBasketButton entryId={data.entryId} />
        </div>
      </>
    );

  const { entry } = data;

  return (
    <>
      {back}
      <section className="grid gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Edit basket</h1>
        <p className="text-ink-2 max-w-2xl">
          Change your coins, waiting slots, BTC in, date or the buy-in amounts, then save. Editing is open until you log
          a sell, a rebuy or a slot fill.
        </p>
      </section>
      <PickerFlow
        coins={data.coins}
        daysSinceHalving={data.daysSinceHalving}
        sellWindowDays={data.sellWindowDays}
        window={data.window}
        prices={data.prices}
        initialBasket={entry.basket}
        initialSlots={entry.openSlots}
        btcIcon={data.btcIcon}
        edit={data.edit}
      />
      <section className="border-loss/30 grid gap-3 rounded-2xl border p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Delete this basket</h2>
        <p className="text-ink-2 text-sm">Removes the basket and every trade in it. You can start a new one after.</p>
        <div>
          <DeleteBasketButton entryId={entry.id} />
        </div>
      </section>
    </>
  );
}
