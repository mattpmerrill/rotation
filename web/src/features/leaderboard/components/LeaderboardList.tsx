import Link from "next/link";
import { formatDay, formatMultiple } from "@/lib/format";
import { Change } from "@/ui/Change";
import { CoinTag } from "@/ui/CoinTag";
import { PhaseBadge } from "@/ui/PhaseBadge";
import { Sparkline } from "@/ui/charts/Sparkline";
import { Money } from "@/ui/unit";
import type { LeaderboardRow } from "../queries";

/** The standings: highest BTC multiple first. Each row opens that player's basket. */
export function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ol className="divide-line border-line bg-surface divide-y overflow-hidden rounded-2xl border">
      {rows.map((r, i) => (
        <li key={r.entryId}>
          <Link
            href={`/entries/${r.entryId}`}
            className="hover:bg-surface-2 grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors sm:grid-cols-[2.5rem_1fr_auto_auto] sm:px-5"
          >
            <span className={`font-display text-lg ${i === 0 && r.multiple ? "text-gold" : "text-ink-3"}`}>
              {i + 1}
            </span>

            <div className="grid min-w-0 gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.playerName}</span>
                {r.isViewer && <span className="text-ink-3 text-xs">you</span>}
                <PhaseBadge phase={r.phase} />
              </div>
              <div className="flex flex-wrap gap-1">
                {r.coins.map((c) => (
                  <CoinTag key={c.id} symbol={c.symbol} />
                ))}
              </div>
              <span className="text-ink-3 text-xs">In since {formatDay(r.startedOn)}</span>
            </div>

            <span className="hidden sm:block">
              <Sparkline values={r.spark} label={`${r.playerName}'s BTC multiple since the buy-in`} />
            </span>

            <div className="grid justify-items-end gap-0.5 text-right">
              {r.multiple == null ? (
                <span className="text-ink-3 text-sm">Waiting for prices</span>
              ) : (
                <>
                  <span className="font-display text-xl sm:text-2xl">{formatMultiple(r.multiple)}</span>
                  <Change value={r.multiple - 1} className="text-sm" />
                  <span className="text-ink-3 text-xs">
                    <Money btc={r.valueBtc!} usd={r.valueUsd!} />
                  </span>
                </>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
