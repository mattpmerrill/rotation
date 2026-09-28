import type { Phase } from "@/domain/types";

const LABEL: Record<Phase, string> = {
  holding_alts: "Holding alts",
  holding_usdt: "Holding USDT",
  back_in_btc: "Back in BTC",
};

const STYLE: Record<Phase, string> = {
  holding_alts: "text-accent-violet border-accent-violet/40 bg-accent-violet/10",
  holding_usdt: "text-accent-aqua border-accent-aqua/40 bg-accent-aqua/10",
  back_in_btc: "text-btc border-btc/40 bg-btc/10",
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
