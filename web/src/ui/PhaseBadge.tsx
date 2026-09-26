import type { Phase } from "@/domain/types";

const LABEL: Record<Phase, string> = {
  holding_alts: "Holding alts",
  holding_usdt: "Holding USDT",
  back_in_btc: "Back in BTC",
};

const STYLE: Record<Phase, string> = {
  holding_alts: "text-series-alts border-series-alts/40",
  holding_usdt: "text-series-usdt border-series-usdt/40",
  back_in_btc: "text-btc border-btc/40",
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${STYLE[phase]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LABEL[phase]}
    </span>
  );
}

export const phaseLabel = (p: Phase) => LABEL[p];
