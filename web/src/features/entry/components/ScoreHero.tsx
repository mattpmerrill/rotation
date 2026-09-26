"use client";

import type { Phase } from "@/domain/types";
import type { ValuePoint } from "@/domain/valuation";
import { formatUsd } from "@/lib/format";
import { Change } from "@/ui/Change";
import { PhaseBadge } from "@/ui/PhaseBadge";
import { useUnit } from "@/ui/unit";

/** The headline: what went in, what it's worth now. "1.00 → 1.18 BTC". */
export function ScoreHero({
  btcIn,
  startUsd,
  now,
  phase,
}: {
  btcIn: number;
  startUsd: number;
  now: ValuePoint | null;
  phase: Phase;
}) {
  const { unit } = useUnit();
  const from = unit === "btc" ? btcIn.toFixed(2) : formatUsd(startUsd);
  const to = now ? (unit === "btc" ? now.totalBtc.toFixed(2) : formatUsd(now.totalUsd)) : "??";
  const change = now ? (unit === "btc" ? now.totalBtc / btcIn : now.totalUsd / startUsd) - 1 : null;

  return (
    <div className="grid gap-3">
      <p
        className="font-display text-4xl leading-none tracking-tight sm:text-6xl"
        style={{ animation: "score-in 500ms ease-out both" }}
      >
        <span className="text-ink-3">{from}</span>
        <span className="text-btc mx-2 sm:mx-4" aria-label="to">
          →
        </span>
        <span>{to}</span>
        {unit === "btc" && <span className="text-ink-3 ml-2 text-lg sm:ml-3 sm:text-2xl">BTC</span>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {change != null && <Change value={change} className="text-lg" />}
        <PhaseBadge phase={phase} />
      </div>
    </div>
  );
}
