import type { EligibleCoin } from "@/domain/basket";
import type { PriceBook } from "@/domain/types";
import { formatBtc } from "@/lib/format";
import { Section } from "@/ui/section";
import { FillSlotForm } from "./fill-slot-form";

export interface WaitingSlotsView {
  open: number;
  waitingBtc: number;
  /** BTC one fill sells. */
  share: number;
  /** Why no slot can be filled now, or null. */
  closedReason: string | null;
  /** The owner's fill form data, or null when there is nothing to fill with or the viewer is not the owner. */
  fill: { coins: EligibleCoin[]; prices: PriceBook; from: string } | null;
}

/** An entry's waiting slots: the form to fill one, or why it can't be filled now. */
export function WaitingSlots({ entryId, slots }: { entryId: number; slots: WaitingSlotsView }) {
  const { open, fill, share, closedReason, waitingBtc } = slots;
  return (
    <Section title={open === 1 ? "A waiting slot" : `${open} waiting slots`} panel>
      {fill ? (
        <FillSlotForm entryId={entryId} share={share} coins={fill.coins} prices={fill.prices} from={fill.from} />
      ) : (
        <p className="text-ink-2 text-sm">
          {closedReason && waitingBtc === 0
            ? closedReason
            : `${formatBtc(waitingBtc)} is waiting as BTC, to buy a coin later.`}
        </p>
      )}
    </Section>
  );
}
